
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
  const slug = req.params.slug || req.headers['x-project-id'] || req.path.split('/')[3];
  if (!slug || req.path.includes('/control/')) return next();
  try {
    const result = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1', [slug]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Project not found' });
    req.project = result.rows[0];
    const dbName = req.project.db_name;
    req.projectPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${dbName}`) });
    next();
  } catch (e) { res.status(500).json({ error: 'DB Resolution Error' }); }
};

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
      req.user = decoded; req.userRole = 'authenticated';
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
    
    // Bootstrap: Roles, Auth Schema e RLS roles
    await tempPool.query(`
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

app.get('/api/data/:slug/policies', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'`);
  res.json(result.rows);
});

app.post('/api/data/:slug/policies', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { name, table, command, role, using, withCheck } = req.body;
  const sql = `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY; CREATE POLICY "${name}" ON public."${table}" FOR ${command} TO ${role} USING (${using}) ${withCheck ? `WITH CHECK (${withCheck})` : ''};`;
  try { await req.projectPool.query(sql); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/data/:slug/policies/:table/:name', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  try { await req.projectPool.query(`DROP POLICY "${req.params.name}" ON public."${req.params.table}"`); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- DATA PLANE - TABLES (POST 404 FIX) ---

app.post('/api/data/:slug/tables', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { name, columns } = req.body;
  const colsSql = columns.map((c: any) => `"${c.name}" ${c.type} ${c.primaryKey ? 'PRIMARY KEY' : ''} ${c.nullable === false ? 'NOT NULL' : ''} ${c.default ? `DEFAULT ${c.default}` : ''}`).join(', ');
  const sql = `CREATE TABLE public."${name}" (${colsSql});`;
  try { await req.projectPool.query(sql); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/data/:slug/tables/:table', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  try { await req.projectPool.query(`DROP TABLE public."${req.params.table}"`); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- DATA BROWSER & QUERY (PUT 404 FIX) ---

app.post('/api/data/:slug/query', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { sql } = req.body;
  const start = Date.now();
  try { const result = await req.projectPool.query(sql); res.json({ ...result, duration: Date.now() - start }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/data/:slug/tables', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query("SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
  res.json(result.rows);
});

app.get('/api/data/:slug/tables/:table/columns', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT column_name as name, data_type as type, is_nullable = 'YES' as "isNullable", EXISTS (SELECT 1 FROM information_schema.key_column_usage kcu WHERE kcu.table_name = $1 AND kcu.column_name = c.column_name) as "isPrimaryKey" FROM information_schema.columns c WHERE table_name = $1`, [req.params.table]);
  res.json(result.rows);
});

app.get('/api/data/:slug/tables/:table/data', resolveProject as any, cascataAuth as any, auditLogger as any, async (req: any, res: any) => {
  try { const result = await req.projectPool.query(`SELECT * FROM public."${req.params.table}" LIMIT 100`); res.json(result.rows); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/tables/:table/rows', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.params;
  const { data } = req.body;
  const keys = Object.keys(data);
  const values = Object.values(data);
  const cols = keys.map(k => `"${k}"`).join(',');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
  try { await req.projectPool.query(`INSERT INTO public."${table}" (${cols}) VALUES (${placeholders})`, values); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.put('/api/data/:slug/tables/:table/rows', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.params;
  const { data, pkColumn, pkValue } = req.body;
  const keys = Object.keys(data).filter(k => k !== pkColumn);
  const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
  const values = [...keys.map(k => data[k]), pkValue];
  try { await req.projectPool.query(`UPDATE public."${table}" SET ${setClause} WHERE "${pkColumn}" = $${values.length}`, values); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/tables/:table/delete-rows', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { ids, pkColumn } = req.body;
  try { await req.projectPool.query(`DELETE FROM public."${req.params.table}" WHERE "${pkColumn}" = ANY($1)`, [ids]); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- AUTH (POST 404 FIX) ---

app.get('/api/data/:slug/auth/users', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query('SELECT id, email, created_at FROM auth.users');
  res.json(result.rows);
});

app.post('/api/data/:slug/auth/users', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { email, password } = req.body;
  try { await req.projectPool.query('INSERT INTO auth.users (email, password_hash) VALUES ($1, $2)', [email, password]); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- STATS & LOGS ---

app.get('/api/data/:slug/stats', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const tables = await req.projectPool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
  const users = await req.projectPool.query("SELECT count(*) FROM auth.users").catch(() => ({ rows: [{ count: 0 }] }));
  const size = await req.projectPool.query("SELECT pg_size_pretty(pg_database_size(current_database()))");
  res.json({ tables: parseInt(tables.rows[0].count), users: parseInt(users.rows[0].count), size: size.rows[0].pg_size_pretty });
});

app.get('/api/data/:slug/logs', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.api_logs WHERE project_slug = $1 ORDER BY created_at DESC LIMIT 100', [req.project.slug]);
  res.json(result.rows);
});

app.listen(PORT, () => console.log(`[CASCATA MASTER ENGINE] v2.6 Operacional na porta ${PORT}`));
