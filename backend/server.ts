
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
app.use(cors() as any);
app.use(express.json({ limit: '100mb' }) as any);

const { Pool } = pg;
const systemPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL });
const PORT = process.env.PORT || 3000;

const STORAGE_ROOT = path.join(process.cwd(), 'storage');
if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });

const upload = multer({ dest: 'uploads/' });
const generateKey = () => crypto.randomBytes(32).toString('hex');

// --- MIDDLEWARES ---

const auditLogger = async (req: any, res: any, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', async () => {
    if (req.project) {
      const duration = Date.now() - start;
      await systemPool.query(
        'INSERT INTO system.api_logs (project_slug, method, path, status_code, client_ip, duration_ms, user_role) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [req.project.slug, req.method, req.path, res.statusCode, req.ip, duration, req.userRole || 'anon']
      ).catch(() => {});
    }
  });
  next();
};

const resolveProject = async (req: any, res: any, next: NextFunction) => {
  // Ignora rotas de controle
  if (req.path.includes('/control/')) return next();

  const host = req.headers.host;
  const pathParts = req.path.split('/');
  const slugFromUrl = pathParts[3]; // /api/data/:slug/...

  try {
    let projectResult;
    
    // 1. Tenta resolver pelo Host (Domínio Customizado)
    projectResult = await systemPool.query('SELECT * FROM system.projects WHERE custom_domain = $1', [host]);
    
    // 2. Fallback: Tenta resolver pelo Slug na URL
    if (projectResult.rowCount === 0 && slugFromUrl) {
      projectResult = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1', [slugFromUrl]);
    }

    if (!projectResult.rows[0]) {
      // Se for uma rota de API mas não achou projeto, 404
      if (req.path.startsWith('/api/data/')) return res.status(404).json({ error: 'Project context not found.' });
      return next();
    }

    req.project = projectResult.rows[0];
    const dbName = req.project.db_name;
    req.projectPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${dbName}`) });
    next();
  } catch (e) { 
    res.status(500).json({ error: 'DB Resolution Error' }); 
  }
};

app.use(resolveProject as any);

const cascataAuth = async (req: any, res: any, next: NextFunction) => {
  if (req.path.includes('/control/')) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Admin Required' });
    try {
      jwt.verify(authHeader.split(' ')[1], process.env.SYSTEM_JWT_SECRET || 'secret');
      return next();
    } catch (e) { return res.status(401).json({ error: 'Invalid Session' }); }
  }

  const apikey = req.headers['apikey'] || req.query.apikey || req.headers['authorization']?.split(' ')[1];
  
  if (apikey === req.project?.service_key || apikey === req.project?.anon_key) { 
    req.userRole = apikey === req.project?.service_key ? 'service_role' : 'anon'; 
    return next(); 
  }

  const authHeader = req.headers['authorization'];
  if (authHeader) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], req.project.jwt_secret);
      req.user = decoded; 
      req.userRole = 'authenticated';
    } catch (e) {}
  }
  next();
};

// --- CONTROL PLANE ---

app.post('/api/control/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
  const admin = result.rows[0];
  if (admin && admin.password_hash === password) {
    const token = jwt.sign({ sub: admin.id, role: 'admin' }, process.env.SYSTEM_JWT_SECRET || 'secret');
    res.json({ token });
  } else res.status(401).json({ error: 'Invalid admin credentials' });
});

app.get('/api/control/projects', cascataAuth as any, async (req, res) => {
  const result = await systemPool.query('SELECT * FROM system.projects ORDER BY created_at DESC');
  res.json(result.rows);
});

app.patch('/api/control/projects/:slug', cascataAuth as any, async (req: any, res: any) => {
  const { name, custom_domain } = req.body;
  try {
    const result = await systemPool.query(
      'UPDATE system.projects SET name = COALESCE($1, name), custom_domain = COALESCE($2, custom_domain), updated_at = now() WHERE slug = $3 RETURNING *',
      [name, custom_domain, req.params.slug]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/control/projects', cascataAuth as any, async (req: any, res: any) => {
  const { name, slug } = req.body;
  const db_name = `cascata_db_${slug.replace(/-/g, '_')}`;
  try {
    await systemPool.query(`CREATE DATABASE ${db_name}`);
    const result = await systemPool.query(
      `INSERT INTO system.projects (name, slug, db_name, anon_key, service_key, jwt_secret) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, slug, db_name, generateKey(), generateKey(), generateKey()]
    );
    
    const tempPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${db_name}`) });
    
    await tempPool.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
        email TEXT UNIQUE, 
        password_hash TEXT, 
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
    await tempPool.end();
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/control/projects/:slug/rotate-keys', cascataAuth as any, async (req, res) => {
  const { type } = req.body;
  const newKey = generateKey();
  const column = type === 'anon' ? 'anon_key' : type === 'service' ? 'service_key' : 'jwt_secret';
  await systemPool.query(`UPDATE system.projects SET ${column} = $1 WHERE slug = $2`, [newKey, req.params.slug]);
  res.json({ success: true, newKey });
});

// --- DATA PLANE - RLS & POLICIES ---

app.get('/api/data/:slug/policies', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'`);
  res.json(result.rows);
});

app.post('/api/data/:slug/policies', cascataAuth as any, async (req: any, res: any) => {
  const { name, table, command, role, using, withCheck } = req.body;
  const sql = `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY; CREATE POLICY "${name}" ON public."${table}" FOR ${command} TO ${role} USING (${using}) ${withCheck ? `WITH CHECK (${withCheck})` : ''};`;
  try { await req.projectPool.query(sql); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/data/:slug/policies/:table/:name', cascataAuth as any, async (req: any, res: any) => {
  try { await req.projectPool.query(`DROP POLICY "${req.params.name}" ON public."${req.params.table}"`); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- DATA PLANE - TABLES & EXPORT ---

app.get('/api/data/:slug/tables/:table/sql', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT 'CREATE TABLE public."' || table_name || '" (' || string_agg('"' || column_name || '" ' || data_type || CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END, ', ') || ');' as ddl FROM information_schema.columns WHERE table_name = $1 GROUP BY table_name`, [req.params.table]);
  res.json({ sql: result.rows[0]?.ddl || `-- No schema found for ${req.params.table}` });
});

app.post('/api/data/:slug/tables', cascataAuth as any, async (req: any, res: any) => {
  const { name, columns } = req.body;
  const colsSql = columns.map((c: any) => `"${c.name}" ${c.type} ${c.primaryKey ? 'PRIMARY KEY' : ''} ${c.nullable === false ? 'NOT NULL' : ''} ${c.default ? `DEFAULT ${c.default}` : ''}`).join(', ');
  const sql = `CREATE TABLE public."${name}" (${colsSql});`;
  try { await req.projectPool.query(sql); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/data/:slug/tables/:table', cascataAuth as any, async (req: any, res: any) => {
  try { await req.projectPool.query(`DROP TABLE public."${req.params.table}" CASCADE`); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- UI SETTINGS ---

app.get('/api/data/:slug/ui-settings/:table', cascataAuth as any, async (req: any, res: any) => {
  const result = await systemPool.query('SELECT settings FROM system.ui_settings WHERE project_slug = $1 AND table_name = $2', [req.project.slug, req.params.table]);
  res.json(result.rows[0]?.settings || {});
});

app.post('/api/data/:slug/ui-settings/:table', cascataAuth as any, async (req: any, res: any) => {
  await systemPool.query('INSERT INTO system.ui_settings (project_slug, table_name, settings) VALUES ($1, $2, $3) ON CONFLICT (project_slug, table_name) DO UPDATE SET settings = $3', [req.project.slug, req.params.table, req.body.settings]);
  res.json({ success: true });
});

// --- ASSETS & LOGIC ENGINE ---

app.get('/api/data/:slug/assets', cascataAuth as any, async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.assets WHERE project_slug = $1 ORDER BY created_at ASC', [req.project.slug]);
  res.json(result.rows);
});

app.post('/api/data/:slug/assets', cascataAuth as any, async (req: any, res: any) => {
  const { id, name, type, parent_id, metadata } = req.body;
  if (id) {
    const result = await systemPool.query('UPDATE system.assets SET name = $1, metadata = $2 WHERE id = $3 RETURNING *', [name, metadata, id]);
    res.json(result.rows[0]);
  } else {
    const result = await systemPool.query('INSERT INTO system.assets (project_slug, name, type, parent_id, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *', [req.project.slug, name, type, parent_id, metadata]);
    res.json(result.rows[0]);
  }
});

app.delete('/api/data/:slug/assets/:id', cascataAuth as any, async (req: any, res: any) => {
  await systemPool.query('DELETE FROM system.assets WHERE id = $1 AND project_slug = $2', [req.params.id, req.project.slug]);
  res.json({ success: true });
});

// --- RPC EXECUTION ---

app.post('/api/data/:slug/rpc/:name', cascataAuth as any, async (req: any, res: any) => {
  const params = req.body;
  const keys = Object.keys(params);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `SELECT * FROM public."${req.params.name}"(${placeholders})`;
  try {
    const result = await req.projectPool.query(sql, Object.values(params));
    res.json(result.rows);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- DATA BROWSER & QUERY ---

app.post('/api/data/:slug/query', cascataAuth as any, async (req: any, res: any) => {
  const { sql } = req.body;
  const start = Date.now();
  try { const result = await req.projectPool.query(sql); res.json({ ...result, duration: Date.now() - start }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/data/:slug/tables', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query("SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
  res.json(result.rows);
});

app.get('/api/data/:slug/tables/:table/columns', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT column_name as name, data_type as type, is_nullable = 'YES' as "isNullable", EXISTS (SELECT 1 FROM information_schema.key_column_usage kcu WHERE kcu.table_name = $1 AND kcu.column_name = c.column_name) as "isPrimaryKey" FROM information_schema.columns c WHERE table_name = $1`, [req.params.table]);
  res.json(result.rows);
});

app.get('/api/data/:slug/tables/:table/data', cascataAuth as any, auditLogger as any, async (req: any, res: any) => {
  try { const result = await req.projectPool.query(`SELECT * FROM public."${req.params.table}" LIMIT 1000`); res.json(result.rows); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/tables/:table/rows', cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.params;
  const { data } = req.body;
  const keys = Object.keys(data);
  const values = Object.values(data);
  const cols = keys.map(k => `"${k}"`).join(',');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
  try { await req.projectPool.query(`INSERT INTO public."${table}" (${cols}) VALUES (${placeholders})`, values); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.put('/api/data/:slug/tables/:table/rows', cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.params;
  const { data, pkColumn, pkValue } = req.body;
  const keys = Object.keys(data).filter(k => k !== pkColumn);
  const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
  const values = [...keys.map(k => data[k]), pkValue];
  try { await req.projectPool.query(`UPDATE public."${table}" SET ${setClause} WHERE "${pkColumn}" = $${values.length}`, values); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/tables/:table/delete-rows', cascataAuth as any, async (req: any, res: any) => {
  const { ids, pkColumn } = req.body;
  try { await req.projectPool.query(`DELETE FROM public."${req.params.table}" WHERE "${pkColumn}" = ANY($1)`, [ids]); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- DISCOVERY ---

app.get('/api/data/:slug/functions', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT routine_name as name, routine_type as type FROM information_schema.routines WHERE routine_schema = 'public'`);
  res.json(result.rows);
});

app.get('/api/data/:slug/triggers', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT trigger_name as name, event_manipulation as event, event_object_table as table FROM information_schema.triggers WHERE trigger_schema = 'public'`);
  res.json(result.rows);
});

// --- AUTH & USER MGMT ---

app.get('/api/data/:slug/auth/users', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query('SELECT id, email, created_at FROM auth.users');
  res.json(result.rows);
});

app.post('/api/data/:slug/auth/users', cascataAuth as any, async (req: any, res: any) => {
  const { email, password } = req.body;
  try { await req.projectPool.query('INSERT INTO auth.users (email, password_hash) VALUES ($1, $2)', [email, password]); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- STATS & LOGS ---

app.get('/api/data/:slug/stats', cascataAuth as any, async (req: any, res: any) => {
  const tables = await req.projectPool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
  const users = await req.projectPool.query("SELECT count(*) FROM auth.users").catch(() => ({ rows: [{ count: 0 }] }));
  const size = await req.projectPool.query("SELECT pg_size_pretty(pg_database_size(current_database()))");
  res.json({ tables: parseInt(tables.rows[0].count), users: parseInt(users.rows[0].count), size: size.rows[0].pg_size_pretty });
});

app.get('/api/data/:slug/logs', cascataAuth as any, async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.api_logs WHERE project_slug = $1 ORDER BY created_at DESC LIMIT 100', [req.project.slug]);
  res.json(result.rows);
});

// --- STORAGE ---

app.get('/api/data/:slug/storage/buckets', cascataAuth as any, async (req: any, res: any) => {
  const p = path.join(STORAGE_ROOT, req.project.slug);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  const folders = fs.readdirSync(p).filter(f => fs.lstatSync(path.join(p, f)).isDirectory());
  res.json(folders.map(b => ({ name: b })));
});

app.get('/api/data/:slug/storage/:bucket/list', cascataAuth as any, async (req: any, res: any) => {
  const p = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket);
  if (!fs.existsSync(p)) return res.json({ files: [] });
  const files = fs.readdirSync(p).map(f => ({ name: f }));
  res.json({ files });
});

app.post('/api/data/:slug/storage/:bucket/upload', cascataAuth as any, upload.single('file') as any, async (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const dest = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, req.file.originalname);
  if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(req.file.path, dest);
  res.json({ success: true, path: req.file.originalname });
});

app.listen(PORT, () => console.log(`[CASCATA MASTER ENGINE] v2.8 Operacional na porta ${PORT}`));
