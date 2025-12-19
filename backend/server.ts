
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
app.use(cors() as any);
app.use(express.json({ limit: '100mb' }) as any);

const { Pool } = pg;
const systemPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL });
const projectPools = new Map<string, pg.Pool>();
const PORT = process.env.PORT || 3000;

const generateKey = () => crypto.randomBytes(32).toString('hex');

// SQL de inicialização para novos bancos de projeto
const BOOTSTRAP_SQL = `
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    raw_user_meta JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE SCHEMA IF NOT EXISTS storage;
  CREATE TABLE IF NOT EXISTS storage.buckets (id TEXT PRIMARY KEY, name TEXT UNIQUE);
  CREATE TABLE IF NOT EXISTS storage.objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id TEXT REFERENCES storage.buckets(id),
    name TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

// --- MIDDLEWARES ---

const securityMaster = async (req: any, res: any, next: NextFunction) => {
  const host = req.headers.host || '';
  const isIP = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}/.test(host.split(':')[0]);

  try {
    const configResult = await systemPool.query("SELECT value FROM system.config WHERE key = 'global_domain'");
    const globalDomain = configResult.rows[0]?.value;

    if (globalDomain) {
      if (isIP) return res.status(403).json({ error: 'Cascata Locked: Acesso via IP desativado.' });
      if (host !== globalDomain && !req.path.startsWith('/api/data/')) {
        return res.status(403).json({ error: 'Domain Binding Violation.' });
      }
    }

    if (req.path === '/api/control/auth/login') return next();

    if (req.path.includes('/control/')) {
      const authHeader = req.headers['authorization'];
      if (!authHeader) return res.status(401).json({ error: 'Admin token missing' });
      try {
        jwt.verify(authHeader.split(' ')[1], process.env.SYSTEM_JWT_SECRET || 'secret');
        return next();
      } catch (e) { return res.status(401).json({ error: 'Session expired' }); }
    }
    next();
  } catch (e) { next(); }
};

const resolveProject = async (req: any, res: any, next: NextFunction) => {
  if (req.path.includes('/control/')) return next();

  const host = req.headers.host || '';
  const pathParts = req.path.split('/');
  const slugFromUrl = pathParts[3]; 

  try {
    let projectResult = await systemPool.query('SELECT * FROM system.projects WHERE custom_domain = $1', [host]);
    if (projectResult.rowCount === 0 && slugFromUrl) {
      projectResult = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1', [slugFromUrl]);
    }
    
    const proj = projectResult.rows[0];
    if (!proj && req.path.startsWith('/api/data/')) return res.status(404).json({ error: 'Instance not found.' });

    if (proj) {
      req.project = proj;
      if (!projectPools.has(proj.db_name)) {
        const dbUrl = process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${proj.db_name}`);
        const pool = new Pool({ connectionString: dbUrl });
        // Auto-Bootstrap on first connection
        try { await pool.query(BOOTSTRAP_SQL); } catch(e) { console.error("Bootstrap warning", e); }
        projectPools.set(proj.db_name, pool);
      }
      req.projectPool = projectPools.get(proj.db_name);
    }
    next();
  } catch (e) { 
    console.error("[CTX ERROR]", e);
    res.status(500).json({ error: 'Context Resolution Error' }); 
  }
};

app.use(securityMaster as any);
app.use(resolveProject as any);

// --- ROUTES ---

app.post('/api/control/auth/login', async (req: any, res: any) => {
  const { email, password } = req.body;
  const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
  const admin = result.rows[0];
  if (admin && admin.password_hash === password) {
    const token = jwt.sign({ sub: admin.id, role: 'admin' }, process.env.SYSTEM_JWT_SECRET || 'secret');
    res.json({ token });
  } else res.status(401).json({ error: 'Credentials failure' });
});

app.get('/api/control/system/config', async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.config');
  const config: any = {};
  result.rows.forEach(row => { config[row.key] = row.value; });
  res.json(config);
});

app.post('/api/control/system/config', async (req: any, res: any) => {
  const { key, value } = req.body;
  await systemPool.query('INSERT INTO system.config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]);
  res.json({ success: true });
});

app.get('/api/control/projects', async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.projects ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/control/projects', async (req: any, res: any) => {
  const { name, slug } = req.body;
  const db_name = `cascata_db_${slug.replace(/-/g, '_')}`;
  try {
    await systemPool.query(`CREATE DATABASE ${db_name}`);
    const result = await systemPool.query(
      `INSERT INTO system.projects (name, slug, db_name, anon_key, service_key, jwt_secret) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, slug, db_name, generateKey(), generateKey(), generateKey()]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/control/projects/:slug', async (req: any, res: any) => {
  const { name, custom_domain, security_config } = req.body;
  const result = await systemPool.query(
    'UPDATE system.projects SET name = COALESCE($1, name), custom_domain = COALESCE($2, custom_domain), security_config = COALESCE($3, security_config), updated_at = now() WHERE slug = $4 RETURNING *',
    [name, custom_domain, security_config ? (typeof security_config === 'string' ? security_config : JSON.stringify(security_config)) : null, req.params.slug]
  );
  res.json(result.rows[0]);
});

app.post('/api/data/:slug/assets', async (req: any, res: any) => {
  const { id, name, type, parent_id, metadata } = req.body;
  try {
    const result = await systemPool.query(
      `INSERT INTO system.assets (id, project_slug, name, type, parent_id, metadata) 
       VALUES (COALESCE($1, uuid_generate_v4()), $2, $3, $4, $5, $6) 
       ON CONFLICT (id) DO UPDATE SET name = $3, metadata = $6, updated_at = now() RETURNING *`,
      [id, req.params.slug, name, type, parent_id, metadata]
    );
    res.json(result.rows[0]);
  } catch (e: any) {
    console.error("[ASSET POST ERROR]", e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/data/:slug/auth/users', async (req: any, res: any) => {
  const { email, password } = req.body;
  try {
    const r = await req.projectPool.query("INSERT INTO auth.users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at", [email, password]);
    res.json(r.rows[0]);
  } catch(e: any) { 
    console.error("[AUTH POST ERROR]", e);
    res.status(400).json({ error: e.message }); 
  }
});

app.get('/api/data/:slug/auth/users', async (req: any, res: any) => {
  try { const r = await req.projectPool.query("SELECT id, email, created_at FROM auth.users"); res.json(r.rows); } catch(e) { res.json([]); }
});

app.get('/api/data/:slug/tables', async (req: any, res: any) => {
  const r = await req.projectPool.query("SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public'");
  res.json(r.rows);
});

app.get('/api/data/:slug/tables/:table/data', async (req: any, res: any) => {
  const r = await req.projectPool.query(`SELECT * FROM public."${req.params.table}" LIMIT 1000`);
  res.json(r.rows);
});

app.get('/api/data/:slug/tables/:table/columns', async (req: any, res: any) => {
  const r = await req.projectPool.query(`
    SELECT column_name as name, data_type as type, is_nullable = 'YES' as "nullable",
    EXISTS (SELECT 1 FROM information_schema.key_column_usage kcu JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name WHERE kcu.table_name = $1 AND kcu.column_name = column_name AND tc.constraint_type = 'PRIMARY KEY') as "isPrimaryKey"
    FROM information_schema.columns WHERE table_name = $1
  `, [req.params.table]);
  res.json(r.rows);
});

app.post('/api/data/:slug/query', async (req: any, res: any) => {
  try { res.json(await req.projectPool.query(req.body.sql)); } catch(e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/data/:slug/policies', async (req: any, res: any) => {
  const r = await req.projectPool.query("SELECT * FROM pg_policies WHERE schemaname = 'public'");
  res.json(r.rows);
});

app.get('/api/data/:slug/ui-settings/:table', async (req: any, res: any) => {
  const result = await systemPool.query('SELECT settings FROM system.ui_settings WHERE project_slug = $1 AND table_name = $2', [req.params.slug, req.params.table]);
  res.json(result.rows[0]?.settings || {});
});

app.post('/api/data/:slug/ui-settings/:table', async (req: any, res: any) => {
  const { settings } = req.body;
  await systemPool.query(
    'INSERT INTO system.ui_settings (project_slug, table_name, settings) VALUES ($1, $2, $3) ON CONFLICT (project_slug, table_name) DO UPDATE SET settings = $3',
    [req.params.slug, req.params.table, settings]
  );
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`[CASCATA MASTER ENGINE] v3.5 operational on port ${PORT}`));
