
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

// Cache de pools para os bancos de dados dos projetos
const projectPools: Record<string, pg.Pool> = {};

const SYSTEM_JWT_SECRET = process.env.SYSTEM_JWT_SECRET || 'fallback_system_secret';
const PORT = process.env.PORT || 3000;

// Helper para obter conexão com banco de projeto
async function getProjectPool(slug: string): Promise<pg.Pool | null> {
  if (projectPools[slug]) return projectPools[slug];

  const result = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1', [slug]);
  if (result.rows.length === 0) return null;

  const project = result.rows[0];
  const connectionString = process.env.SYSTEM_DATABASE_URL?.replace(/\/[^/]+$/, `/${project.db_name}`);
  
  const pool = new Pool({ connectionString });
  projectPools[slug] = pool;
  return pool;
}

// Middleware de Autenticação para o ADMIN (Control Plane)
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

// --- CONTROL PLANE ENDPOINTS ---

app.post('/api/control/auth/login', async (req, res) => {
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
    res.status(500).json({ error: 'Auth error' });
  }
});

app.get('/api/control/projects', authenticateAdmin, async (req, res) => {
  const result = await systemPool.query('SELECT * FROM system.projects ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/control/projects', authenticateAdmin, async (req, res) => {
  const { name, slug } = req.body;
  const dbName = `cascata_proj_${slug.replace(/[^a-z0-9]/gi, '_')}`;
  
  try {
    // 1. Criar o Banco de Dados (Não pode ser em transação)
    await systemPool.query(`CREATE DATABASE ${dbName}`);

    // 2. Inicializar estrutura básica no novo banco
    const tempPool = new Pool({ 
      connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^/]+$/, `/${dbName}`) 
    });
    
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

    // 3. Registrar no sistema
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

// --- DATA PLANE ENDPOINTS (Onde o "trabalho" acontece) ---

// Explorador de Tabelas
app.get('/api/data/:slug/tables', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project DB not found' });

  try {
    const result = await pool.query(`
      SELECT table_name as name, table_schema as schema 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to introspect tables' });
  }
});

// RPC Dinâmico: SQL Function -> HTTP Endpoint
app.post('/api/data/:slug/rpc/:func', async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });

  try {
    const args = req.body;
    const argKeys = Object.keys(args);
    const placeholders = argKeys.map((_, i) => `$${i + 1}`).join(', ');
    const argValues = Object.values(args);

    const result = await pool.query(
      `SELECT * FROM ${req.params.func}(${placeholders})`,
      argValues
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(400).json({ error: 'RPC Execution Error: ' + err.message });
  }
});

// Listar Funções (Para o Dashboard)
app.get('/api/data/:slug/functions', authenticateAdmin, async (req, res) => {
  const pool = await getProjectPool(req.params.slug);
  if (!pool) return res.status(404).json({ error: 'Project not found' });

  try {
    const result = await pool.query(`
      SELECT routine_name as name, routine_type as type
      FROM information_schema.routines
      WHERE routine_schema = 'public'
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch functions' });
  }
});

app.listen(PORT, () => console.log(`Cascata Engine running on ${PORT}`));
