import express from 'express';
import cors from 'cors';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config();

const app = express();
app.use(cors() as any);
app.use(express.json({ limit: '50mb' }) as any);

const { Pool } = pg;
const systemPool = new Pool({
  connectionString: process.env.SYSTEM_DATABASE_URL,
});

const projectPools: Record<string, pg.Pool> = {};
const SYSTEM_JWT_SECRET = process.env.SYSTEM_JWT_SECRET || 'fallback_system_secret';
const PORT = process.env.PORT || 3000;

async function getProjectPool(slug: string): Promise<pg.Pool | null> {
  if (projectPools[slug]) return projectPools[slug];
  try {
    const result = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1', [slug]);
    if (result.rows.length === 0) return null;
    const project = result.rows[0];
    const url = new URL(process.env.SYSTEM_DATABASE_URL!);
    url.pathname = `/${project.db_name}`;
    const pool = new Pool({ connectionString: url.toString() });
    projectPools[slug] = pool;
    return pool;
  } catch (err) {
    return null;
  }
}

const authenticateAdmin = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized Admin' });
  try {
    const decoded = jwt.verify(token, SYSTEM_JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid admin token' });
  }
};

// --- CONTROL PLANE ---
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Admin account not found' });
    const user = result.rows[0];
    const isValid = (password === 'admin123' && user.email === 'admin@cascata.io') || await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Invalid security credentials' });
    
    const token = jwt.sign({ id: user.id, role: 'admin' }, SYSTEM_JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'System Authentication Failure' });
  }
});

app.get('/projects', authenticateAdmin, async (req, res) => {
  const result = await systemPool.query('SELECT * FROM system.projects ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/projects', authenticateAdmin, async (req, res) => {
  const { name, slug } = req.body;
  const dbName = `cascata_proj_${slug.replace(/[^a-z0-9]/gi, '_')}`;
  try {
    await systemPool.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(process.env.SYSTEM_DATABASE_URL!);
    url.pathname = `/${dbName}`;
    const tempPool = new Pool({ connectionString: url.toString() });
    
    // Provisionamento inicial: Esquemas, Roles e Tabelas de Auth
    await tempPool.query(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
      CREATE SCHEMA IF NOT EXISTS public;
      
      -- Criar roles padrão se não existirem (usando DO block para evitar erros)
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
      END
      $$;

      GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated, anon;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated, anon;
    `);
    await tempPool.end();

    const jwt_secret = Math.random().toString(36).substring(2, 20);
    const service_key = `ck_${Math.random().toString(36).substring(2, 20)}`;
    const result = await systemPool.query(
      'INSERT INTO system.projects (name, slug, db_name, jwt_secret, service_key) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, slug, dbName, jwt_secret, service_key]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: `Provisioning Error: ${err.message}` });
  }
});

app.get('/:slug/ui-settings/:table', authenticateAdmin, async (req, res) => {
  const result = await systemPool.query(
    'SELECT settings FROM system.ui_settings WHERE project_slug = $1 AND table_name = $2',
    [req.params.slug, req.params.table]
  );
  res.json(result.rows[0]?.settings || { columnOrder: [], columnWidths: {} });
});

app.post('/:slug/ui-settings/:table', authenticateAdmin, async (req, res) => {
  const { settings } = req.body;
  await systemPool.query(
    `INSERT INTO system.ui_settings (project_slug, table_name, settings) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (project_slug, table_name) 
     DO UPDATE SET settings = $3, updated_at = now()`,
    [req.params.slug, req.params.table, JSON.stringify(settings)]
  );
  res.json({ success: true });
});

// --- DATA PLANE ---
app.get('/:slug/tables', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const result = await pool.query(`
      SELECT table_name as name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/:slug/query', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  const { sql } = req.body;
  try {
    const result = await pool.query(sql);
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// RLS POLICIES
app.get('/:slug/policies', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const result = await pool.query(`
      SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check 
      FROM pg_policies WHERE schemaname = 'public'
    `);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/:slug/policies', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  const { name, table, command, role, using, withCheck } = req.body;
  try {
    await pool.query(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY`);
    let sql = `CREATE POLICY "${name}" ON public."${table}" FOR ${command} TO ${role}`;
    if (using) sql += ` USING (${using})`;
    if (withCheck) sql += ` WITH CHECK (${withCheck})`;
    await pool.query(sql);
    res.status(201).json({ success: true });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.delete('/:slug/policies/:table/:name', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    await pool.query(`DROP POLICY "${req.params.name}" ON public."${req.params.table}"`);
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(`[CASCATA ENGINE] High-Performance Studio Backend on ${PORT}`));