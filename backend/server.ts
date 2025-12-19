
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
const PORT = process.env.PORT || 3000;

const generateKey = () => crypto.randomBytes(32).toString('hex');

// --- MIDDLEWARES ESTRUTURAIS ---

const securityMaster = async (req: any, res: any, next: NextFunction) => {
  const host = req.headers.host || '';
  const isIP = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}/.test(host.split(':')[0]);

  try {
    const configResult = await systemPool.query("SELECT value FROM system.config WHERE key = 'global_domain'");
    const globalDomain = configResult.rows[0]?.value;

    // Lógica Obrigatória: IP só funciona até configurar domínio
    if (globalDomain) {
      if (isIP) {
        return res.status(403).json({ error: 'Cascata Locked: Use the authorized domain to access management.' });
      }
      if (host !== globalDomain && !req.path.startsWith('/api/data/')) {
        return res.status(403).json({ error: 'Domain Binding Violation.' });
      }
    }

    // Auth especial para Login
    if (req.path === '/api/control/auth/login') return next();

    // Proteção Control Plane
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
    // 1. Resolver por domínio customizado do projeto
    let projectResult = await systemPool.query('SELECT * FROM system.projects WHERE custom_domain = $1', [host]);
    
    if (projectResult.rowCount > 0) {
      req.project = projectResult.rows[0];
    } else if (slugFromUrl) {
      // 2. Resolver por slug (apenas se o projeto NÃO tiver domínio próprio)
      projectResult = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1', [slugFromUrl]);
      const proj = projectResult.rows[0];
      
      if (proj && proj.custom_domain && host !== proj.custom_domain) {
        return res.status(403).json({ error: 'This project is locked to its private domain.' });
      }
      req.project = proj;
    }

    if (!req.project) {
      if (req.path.startsWith('/api/data/')) return res.status(404).json({ error: 'Instance not found.' });
      return next();
    }

    // Conectar ao pool isolado do projeto
    req.projectPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${req.project.db_name}`) });
    
    // Auth Data Plane (API Keys)
    const apikey = req.headers['apikey'] || req.query.apikey || req.headers['authorization']?.split(' ')[1];
    if (apikey === req.project.service_key) req.userRole = 'service_role';
    else if (apikey === req.project.anon_key) req.userRole = 'anon';

    next();
  } catch (e) { res.status(500).json({ error: 'Context Resolution Error' }); }
};

app.use(securityMaster as any);
app.use(resolveProject as any);

// --- CONTROL PLANE (ADMIN) ---

app.post('/api/control/auth/login', async (req: any, res: any) => {
  const { email, password } = req.body;
  const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
  const admin = result.rows[0];
  if (admin && admin.password_hash === password) {
    const token = jwt.sign({ sub: admin.id, role: 'admin' }, process.env.SYSTEM_JWT_SECRET || 'secret');
    res.json({ token });
  } else res.status(401).json({ error: 'Credentials failure' });
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
    [name, custom_domain, security_config ? JSON.stringify(security_config) : null, req.params.slug]
  );
  res.json(result.rows[0]);
});

app.get('/api/control/projects/:slug/webhooks', async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.webhooks WHERE project_slug = $1', [req.params.slug]);
  res.json(result.rows);
});

// --- DATA PLANE (RESTORED & FIXED ROUTES) ---

// 1. Observability (Logs)
app.get('/api/data/:slug/logs', async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.api_logs WHERE project_slug = $1 ORDER BY created_at DESC LIMIT 100', [req.params.slug]);
  res.json(result.rows);
});

// 2. Identity (Auth Users)
app.get('/api/data/:slug/auth/users', async (req: any, res: any) => {
  try {
    const result = await req.projectPool.query("SELECT id, email, created_at FROM auth.users");
    res.json(result.rows);
  } catch (e) { res.json([]); }
});

// 3. Logic Assets (Metadata)
app.get('/api/data/:slug/assets', async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.assets WHERE project_slug = $1', [req.params.slug]);
  res.json(result.rows);
});

// 4. Physical Schema Objects (Functions, Triggers, Policies)
app.get('/api/data/:slug/functions', async (req: any, res: any) => {
  const result = await req.projectPool.query(`
    SELECT n.nspname as schema, p.proname as name, pg_get_function_result(p.oid) as return_type
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
  `);
  res.json(result.rows);
});

app.get('/api/data/:slug/triggers', async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT tgname as name, relname as table_name FROM pg_trigger JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid WHERE NOT tgisinternal`);
  res.json(result.rows);
});

app.get('/api/data/:slug/policies', async (req: any, res: any) => {
  const result = await req.projectPool.query("SELECT * FROM pg_policies WHERE schemaname = 'public'");
  res.json(result.rows);
});

// 5. Data Browser (Tables & Query)
app.get('/api/data/:slug/tables', async (req: any, res: any) => {
  const result = await req.projectPool.query("SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public'");
  res.json(result.rows);
});

app.get('/api/data/:slug/tables/:table/columns', async (req: any, res: any) => {
  const result = await req.projectPool.query(`
    SELECT column_name as name, data_type as type, is_nullable = 'YES' as "nullable",
    EXISTS (SELECT 1 FROM information_schema.key_column_usage kcu JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name WHERE kcu.table_name = $1 AND kcu.column_name = column_name AND tc.constraint_type = 'PRIMARY KEY') as "isPrimaryKey"
    FROM information_schema.columns WHERE table_name = $1
  `, [req.params.table]);
  res.json(result.rows);
});

app.get('/api/data/:slug/tables/:table/data', async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT * FROM public."${req.params.table}" LIMIT 1000`);
  res.json(result.rows);
});

app.get('/api/data/:slug/stats', async (req: any, res: any) => {
  try {
    const tables = await req.projectPool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
    const size = await req.projectPool.query("SELECT pg_size_pretty(pg_database_size(current_database()))");
    const users = await req.projectPool.query("SELECT count(*) FROM auth.users").catch(() => ({ rows: [{ count: 0 }] }));
    res.json({ tables: parseInt(tables.rows[0].count), size: size.rows[0].pg_size_pretty, users: parseInt(users.rows[0].count) });
  } catch (e) { res.json({ tables: 0, size: '0 MB', users: 0 }); }
});

app.post('/api/data/:slug/query', async (req: any, res: any) => {
  const startTime = Date.now();
  try {
    const result = await req.projectPool.query(req.body.sql);
    await systemPool.query('INSERT INTO system.api_logs (project_slug, method, path, status_code, duration_ms) VALUES ($1, $2, $3, $4, $5)', 
      [req.params.slug, 'POST', req.path, 200, Date.now() - startTime]);
    res.json(result);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`[CASCATA MASTER ENGINE] v3.1 Operational on port ${PORT}`));
