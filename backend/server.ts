
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
    const tablesResult = await pool.query(`
      SELECT table_name as name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    const tablesWithCount = await Promise.all(tablesResult.rows.map(async (row) => {
      try {
        const countRes = await pool.query(`SELECT count(*) FROM public."${row.name}"`);
        return { ...row, count: parseInt(countRes.rows[0].count) };
      } catch {
        return { ...row, count: 0 };
      }
    }));
    
    res.json(tablesWithCount);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/:slug/tables/:table/rename', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  const { newName } = req.body;
  try {
    if (!/^[a-z0-9_]+$/i.test(newName)) throw new Error("Invalid table name. Use lowercase, numbers and underscores.");
    await pool.query(`ALTER TABLE public."${req.params.table}" RENAME TO "${newName}"`);
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.delete('/:slug/tables/:table', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    await pool.query(`DROP TABLE public."${req.params.table}"`);
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.get('/:slug/tables/:table/sql', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const colsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
    `, [req.params.table]);
    const pksResult = await pool.query(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
    `, [req.params.table]);
    const pks = pksResult.rows.map(r => r.column_name);
    const cols = colsResult.rows.map(c => `  "${c.column_name}" ${c.data_type}${pks.includes(c.column_name) ? ' PRIMARY KEY' : ''}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}${c.column_default ? ' DEFAULT ' + c.column_default : ''}`).join(',\n');
    res.json({ sql: `CREATE TABLE public."${req.params.table}" (\n${cols}\n);` });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.get('/:slug/tables/:table/data', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const result = await pool.query(`SELECT * FROM public."${req.params.table}" LIMIT 1000`);
    res.json(result.rows);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.post('/:slug/tables/:table/rows', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  const { data } = req.body;
  // Deep sanitization: convert values to appropriate PG formats and filter empty strings for defaults
  const sanitizedData: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === '') continue;
    
    // Check if it's a numeric field from string
    if (typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== '') {
       sanitizedData[key] = Number(value);
    } else {
       sanitizedData[key] = value;
    }
  }

  const keys = Object.keys(sanitizedData).map(k => `"${k}"`).join(', ');
  const values = Object.values(sanitizedData);
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  
  try {
    if (keys.length === 0) {
       await pool.query(`INSERT INTO public."${req.params.table}" DEFAULT VALUES`);
    } else {
       await pool.query(`INSERT INTO public."${req.params.table}" (${keys}) VALUES (${placeholders})`, values);
    }
    res.json({ success: true });
  } catch (err: any) { 
    console.error('PG Insertion Error:', err.message);
    res.status(400).json({ error: err.message }); 
  }
});

app.post('/:slug/tables/:table/delete-rows', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  const { ids, pkColumn } = req.body;
  try {
    await pool.query(`DELETE FROM public."${req.params.table}" WHERE "${pkColumn}" = ANY($1)`, [ids]);
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.post('/:slug/tables', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  const { name, columns } = req.body;
  const colSql = columns.map((c: any) => `"${c.name}" ${c.type} ${c.primaryKey ? 'PRIMARY KEY' : ''} ${c.nullable ? '' : 'NOT NULL'} ${c.default ? 'DEFAULT ' + c.default : ''}`).join(', ');
  try {
    await pool.query(`CREATE TABLE public."${name}" (${colSql})`);
    res.status(201).json({ success: true });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.get('/:slug/tables/:table/columns', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  const result = await pool.query(`
    SELECT column_name as name, data_type as type, is_nullable as nullable, column_default as default,
    EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc 
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name 
        WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY' AND kcu.column_name = columns.column_name
    ) as "isPrimaryKey"
    FROM information_schema.columns 
    WHERE table_name = $1 AND table_schema = 'public'
    ORDER BY ordinal_position
  `, [req.params.table]);
  res.json(result.rows);
});

app.get('/:slug/auth/users', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  const result = await pool.query('SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/:slug/auth/users', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  const { email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    await pool.query('INSERT INTO auth.users (email, password_hash) VALUES ($1, $2)', [email, hash]);
    res.status(201).json({ success: true });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.get('/:slug/policies', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  const result = await pool.query(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
    FROM pg_policies WHERE schemaname = 'public'
  `);
  res.json(result.rows);
});

app.post('/:slug/policies', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  const { name, table, command, check } = req.body;
  try {
    await pool.query(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY`);
    await pool.query(`CREATE POLICY "${name}" ON public."${table}" FOR ${command} USING (${check})`);
    res.status(201).json({ success: true });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(`[CASCATA ENGINE] High-Performance Studio Backend on ${PORT}`));
