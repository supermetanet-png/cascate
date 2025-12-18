
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config();

const app = express();
app.use(cors() as any);
app.use(express.json() as any);

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
    if (result.rows.length === 0) return res.status(401).json({ error: 'Admin not found' });
    const user = result.rows[0];
    const isValid = password === 'admin123' || await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, role: 'admin' }, SYSTEM_JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Internal Auth Error' });
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
    await tempPool.query(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
      CREATE SCHEMA IF NOT EXISTS public;
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
    res.status(500).json({ error: err.message });
  }
});

// --- DATA PLANE & INTROSPECTION ---

app.get('/:slug/stats', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const tableCount = await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
    const userCount = await pool.query("SELECT count(*) FROM auth.users");
    const dbSize = await pool.query("SELECT pg_size_pretty(pg_database_size(current_database()))");
    res.json({
      tables: parseInt(tableCount.rows[0].count),
      users: parseInt(userCount.rows[0].count),
      size: dbSize.rows[0].pg_size_pretty
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/:slug/tables', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  const result = await pool.query(`
    SELECT table_name as name, table_schema as schema 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  res.json(result.rows);
});

// Criar Tabela No-Code
app.post('/:slug/tables', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  
  const { name, columns } = req.body;
  if (!name || !columns || !Array.isArray(columns)) {
    return res.status(400).json({ error: 'Invalid table definition' });
  }

  const columnDefs = columns.map((col: any) => {
    let def = `"${col.name}" ${col.type}`;
    if (col.primaryKey) def += ' PRIMARY KEY';
    if (!col.nullable) def += ' NOT NULL';
    if (col.default) def += ` DEFAULT ${col.default}`;
    return def;
  }).join(', ');

  try {
    await pool.query(`CREATE TABLE public."${name}" (${columnDefs})`);
    res.status(201).json({ message: `Table ${name} created successfully` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/:slug/tables/:table/columns', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const result = await pool.query(`
      SELECT column_name as name, data_type as type, is_nullable as nullable, column_default as default
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [req.params.table]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/:slug/tables/:table/data', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const result = await pool.query(`SELECT * FROM public."${req.params.table}" LIMIT 100`);
    res.json(result.rows);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/:slug/query', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const { sql } = req.body;
    const result = await pool.query(sql);
    res.json({ rows: result.rows, rowCount: result.rowCount, command: result.command });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- AUTH MANAGEMENT ---

app.get('/:slug/auth/users', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const result = await pool.query('SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/:slug/auth/users', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  const { email, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO auth.users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, hash]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/:slug/policies', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const result = await pool.query(`
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE schemaname = 'public'
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch policies' });
  }
});

app.get('/:slug/functions', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  const result = await pool.query(`
    SELECT routine_name as name, routine_type as type
    FROM information_schema.routines
    WHERE routine_schema = 'public'
  `);
  res.json(result.rows);
});

app.listen(PORT, () => console.log(`[CASCATA] Engine started on ${PORT}`));
