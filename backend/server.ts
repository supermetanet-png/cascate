
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
  if (!apikey && !req.headers['authorization']) return res.status(401).json({ error: 'API Key Required' });
  if (apikey === req.project?.service_key) { req.userRole = 'service_role'; return next(); }
  req.userRole = 'anon';
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
  } else res.status(401).json({ error: 'Invalid admin' });
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
    await tempPool.query('CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT UNIQUE, password_hash TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());');
    await tempPool.end();
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- DATA PLANE DISCOVERY (NECESSARY FOR RPC MANAGER) ---

app.get('/api/data/:slug/functions', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`
    SELECT routine_name as name, routine_type as type 
    FROM information_schema.routines 
    WHERE routine_schema = 'public'
  `);
  res.json(result.rows);
});

app.get('/api/data/:slug/triggers', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`
    SELECT trigger_name as name, event_manipulation as event, event_object_table as table 
    FROM information_schema.triggers 
    WHERE trigger_schema = 'public'
  `);
  res.json(result.rows);
});

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

// --- ASSETS & LOGIC ---

app.get('/api/data/:slug/assets', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.assets WHERE project_slug = $1', [req.project.slug]);
  res.json(result.rows);
});

app.post('/api/data/:slug/assets', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { id, name, type, parent_id, metadata } = req.body;
  if (id) {
    const result = await systemPool.query('UPDATE system.assets SET name = $1, metadata = $2 WHERE id = $3 RETURNING *', [name, metadata, id]);
    res.json(result.rows[0]);
  } else {
    const result = await systemPool.query('INSERT INTO system.assets (project_slug, name, type, parent_id, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *', [req.project.slug, name, type, parent_id, metadata]);
    res.json(result.rows[0]);
  }
});

app.delete('/api/data/:slug/assets/:id', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  await systemPool.query('DELETE FROM system.assets WHERE id = $1 AND project_slug = $2', [req.params.id, req.project.slug]);
  res.json({ success: true });
});

// --- DATA BROWSER & QUERY ---

app.post('/api/data/:slug/query', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { sql } = req.body;
  const start = Date.now();
  try {
    const result = await req.projectPool.query(sql);
    res.json({ ...result, duration: Date.now() - start });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
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
  try {
    const result = await req.projectPool.query(`SELECT * FROM public."${req.params.table}" LIMIT 100`);
    res.json(result.rows);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/tables/:table/rows', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.params;
  const { data } = req.body;
  const keys = Object.keys(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
  const columns = keys.map(k => `"${k}"`).join(',');
  try {
    const result = await req.projectPool.query(`INSERT INTO public."${table}" (${columns}) VALUES (${placeholders}) RETURNING *`, Object.values(data));
    res.json(result.rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- AUTH & STORAGE ---

app.get('/api/data/:slug/auth/users', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query('SELECT id, email, created_at FROM auth.users');
  res.json(result.rows);
});

app.post('/api/data/:slug/auth/users', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { email, password } = req.body;
  const result = await req.projectPool.query('INSERT INTO auth.users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at', [email, password]);
  res.json(result.rows[0]);
});

app.get('/api/data/:slug/storage/buckets', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const p = path.join(STORAGE_ROOT, req.project.slug);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  res.json(fs.readdirSync(p).filter(f => fs.lstatSync(path.join(p, f)).isDirectory()).map(b => ({ name: b })));
});

app.post('/api/data/:slug/storage/:bucket/upload', resolveProject as any, cascataAuth as any, upload.single('file') as any, async (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const dest = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, req.file.originalname);
  if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(req.file.path, dest);
  res.json({ success: true, path: req.file.originalname });
});

app.listen(PORT, () => console.log(`[CASCATA MASTER ENGINE] v2.1 Operacional na porta ${PORT}`));
