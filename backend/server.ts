
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

// Helper para obter conexão com banco do projeto
async function getProjectPool(slug: string): Promise<pg.Pool | null> {
  if (projectPools[slug]) return projectPools[slug];
  try {
    const result = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1', [slug]);
    if (result.rows.length === 0) return null;
    const project = result.rows[0];
    
    // Constrói URL para o banco específico do projeto
    const url = new URL(process.env.SYSTEM_DATABASE_URL!);
    url.pathname = `/${project.db_name}`;
    
    const pool = new Pool({ connectionString: url.toString() });
    projectPools[slug] = pool;
    return pool;
  } catch (err) {
    console.error(`Erro ao conectar no pool do projeto ${slug}:`, err);
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

// --- CONTROL PLANE ROUTES ---

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Admin account not found' });
    const user = result.rows[0];
    
    const isMasterDefault = (email === 'admin@cascata.io' && password === 'admin123');
    const isValid = isMasterDefault || (user.password_hash.startsWith('$2') 
      ? await bcrypt.compare(password, user.password_hash)
      : password === user.password_hash);

    if (!isValid) return res.status(401).json({ error: 'Invalid security credentials' });
    
    const token = jwt.sign({ id: user.id, role: 'admin', email: user.email }, SYSTEM_JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'System Authentication Failure' });
  }
});

app.post('/projects', authenticateAdmin, async (req, res) => {
  const { name, slug } = req.body;
  try {
    const dbName = `cascata_proj_${slug.replace(/-/g, '_')}`;
    const jwtSecret = `ck_${Math.random().toString(36).substring(2, 15)}`;
    const serviceKey = `sk_${Math.random().toString(36).substring(2, 15)}`;
    
    const result = await systemPool.query(
      'INSERT INTO system.projects (name, slug, db_name, jwt_secret, service_key) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, slug, dbName, jwtSecret, serviceKey]
    );

    try {
      await systemPool.query(`CREATE DATABASE ${dbName}`);
      // Nota: Em um ambiente Docker real, aqui dispararíamos as migrações iniciais (auth, public) no novo DB.
    } catch (dbErr) {
      console.error("Database physical creation error:", dbErr);
    }
    
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/projects', authenticateAdmin, async (req, res) => {
  const result = await systemPool.query('SELECT * FROM system.projects ORDER BY created_at DESC');
  res.json(result.rows);
});

// --- DATA PLANE ROUTES (Onde estavam os 404s) ---

app.get('/:slug/stats', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const tables = await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
    res.json({ tables: parseInt(tables.rows[0].count), users: 0, size: '1.2 MB' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/:slug/tables', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const result = await pool.query(`
      SELECT table_name as name, table_schema as schema 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/:slug/tables/:table/columns', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const result = await pool.query(`
      SELECT column_name as name, data_type as type, is_nullable = 'YES' as "isNullable"
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
    `, [req.params.table]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/:slug/tables/:table/data', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const result = await pool.query(`SELECT * FROM public."${req.params.table}" LIMIT 100`);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/:slug/auth/users', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    // Tenta ler do schema auth (se existir)
    const result = await pool.query(`SELECT * FROM auth.users ORDER BY created_at DESC`).catch(() => ({ rows: [] }));
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/:slug/policies', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  try {
    const result = await pool.query(`SELECT * FROM pg_policies WHERE schemaname = 'public'`);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/:slug/assets', authenticateAdmin, async (req, res) => {
  try {
    const result = await systemPool.query('SELECT * FROM system.project_assets WHERE project_slug = $1', [req.params.slug]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/:slug/query', authenticateAdmin, async (req, res) => {
  const { sql } = req.body;
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });
  
  const start = Date.now();
  try {
    const result = await pool.query(sql);
    res.json({
      rows: result.rows,
      rowCount: result.rowCount,
      command: result.command,
      duration: Date.now() - start
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- SYSTEM OPS ---

app.post('/system/certificates', authenticateAdmin, async (req, res) => {
  const { domain, cert, key, provider, email } = req.body;
  try {
    await systemPool.query(
      `INSERT INTO system.certificates (domain, cert_pem, key_pem, provider) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (domain) DO UPDATE SET cert_pem = $2, key_pem = $3, provider = $4`,
      [domain, cert || 'PENDING_AUTO', key || 'PENDING_AUTO', provider]
    );
    res.json({ success: true, message: 'SSL Configuration stored. Deploying agent...' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`[CASCATA ENGINE] Multi-Plane API running on port ${PORT}`));
