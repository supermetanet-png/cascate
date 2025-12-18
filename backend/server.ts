
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
app.use(express.json({ limit: '50mb' }) as any);

const { Pool } = pg;
const systemPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL });
const PORT = process.env.PORT || 3000;

// --- HELPERS ---
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
    req.projectPool = new Pool({ 
      connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${dbName}`) 
    });
    next();
  } catch (e) {
    res.status(500).json({ error: 'Database resolution failed' });
  }
};

const cascataAuth = async (req: any, res: any, next: NextFunction) => {
  // Chamadas de controle (Studio) usam JWT de Admin
  if (req.path.includes('/control/')) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Admin JWT required' });
    try {
      const token = authHeader.split(' ')[1];
      jwt.verify(token, process.env.SYSTEM_JWT_SECRET || 'secret');
      return next();
    } catch (e) { return res.status(401).json({ error: 'Invalid Admin Session' }); }
  }

  // Chamadas de Dados (API Externa/Studio Data) usam API Keys
  const apikey = req.headers['apikey'] || req.query.apikey;
  if (!apikey) return res.status(401).json({ error: 'API Key required' });

  if (apikey === req.project?.service_key) { req.userRole = 'service_role'; return next(); }
  if (apikey === req.project?.anon_key) { 
    req.userRole = 'anon';
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, req.project.jwt_secret);
        req.user = decoded;
        req.userRole = 'authenticated';
      } catch (e) {}
    }
    return next(); 
  }
  res.status(401).json({ error: 'Invalid API Key' });
};

// --- ROUTES: CONTROL PLANE (Studio Management) ---

app.post('/api/control/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
  const admin = result.rows[0];
  if (admin && admin.password_hash === password) { // Em prod, usar bcrypt
    const token = jwt.sign({ sub: admin.id, role: 'admin' }, process.env.SYSTEM_JWT_SECRET || 'secret');
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.get('/api/control/projects', cascataAuth as any, async (req, res) => {
  const result = await systemPool.query('SELECT * FROM system.projects ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/control/projects', async (req: any, res: any) => {
  const { name, slug } = req.body;
  const db_name = `cascata_db_${slug.replace(/-/g, '_')}`;
  try {
    await systemPool.query(`CREATE DATABASE ${db_name}`);
    const anon_key = generateKey();
    const service_key = generateKey();
    const jwt_secret = generateKey();
    const result = await systemPool.query(
      `INSERT INTO system.projects (name, slug, db_name, anon_key, service_key, jwt_secret) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, slug, db_name, anon_key, service_key, jwt_secret]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- ROUTES: DATA PLANE (Project Discovery & Operations) ---

// Discovery: Listar Tabelas
app.get('/api/data/:slug/tables', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`
    SELECT table_name as name, table_schema as schema 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  res.json(result.rows);
});

// Discovery: Listar Colunas
app.get('/api/data/:slug/tables/:table/columns', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.params;
  const result = await req.projectPool.query(`
    SELECT column_name as name, data_type as type, is_nullable = 'YES' as nullable,
           EXISTS (SELECT 1 FROM information_schema.key_column_usage kcu 
                   WHERE kcu.table_name = $1 AND kcu.column_name = information_schema.columns.column_name) as "isPrimaryKey"
    FROM information_schema.columns WHERE table_name = $1
  `, [table]);
  res.json(result.rows);
});

// CRUD: Select
app.get('/api/data/:slug/tables/:table/data', resolveProject as any, cascataAuth as any, auditLogger as any, async (req: any, res: any) => {
  const { table } = req.params;
  try {
    const result = await req.projectPool.query(`SELECT * FROM public.${table} LIMIT 100`);
    res.json(result.rows);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// CRUD: Insert
app.post('/api/data/:slug/tables/:table/rows', resolveProject as any, cascataAuth as any, auditLogger as any, async (req: any, res: any) => {
  const { table } = req.params;
  const { data } = req.body;
  const cols = Object.keys(data).join(', ');
  const placeholders = Object.keys(data).map((_, i) => `$${i+1}`).join(', ');
  try {
    const result = await req.projectPool.query(`INSERT INTO public.${table} (${cols}) VALUES (${placeholders}) RETURNING *`, Object.values(data));
    res.json(result.rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- RPC API: Chamadas Externas (Curl/n8n/SDK) ---
app.post('/api/data/:slug/rpc/:name', resolveProject as any, cascataAuth as any, auditLogger as any, async (req: any, res: any) => {
  const { name } = req.params;
  const params = req.body; // { param1: val1, param2: val2 }
  
  const keys = Object.keys(params);
  const placeholders = keys.map((_, i) => `$${i+1}`).join(', ');
  
  try {
    const query = `SELECT * FROM public.${name}(${placeholders})`;
    const result = await req.projectPool.query(query, Object.values(params));
    res.json(result.rows);
  } catch (e: any) {
    res.status(400).json({ error: `RPC Execution Failed: ${e.message}` });
  }
});

// --- METADATA & ASSETS (Para o Logic Engine) ---
app.get('/api/data/:slug/assets', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.ui_settings WHERE project_slug = $1 AND table_name LIKE \'asset_%\'', [req.project.slug]);
  res.json(result.rows.map((r: any) => r.settings));
});

app.post('/api/data/:slug/assets', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const asset = req.body;
  await systemPool.query(
    'INSERT INTO system.ui_settings (project_slug, table_name, settings) VALUES ($1, $2, $3) ON CONFLICT (project_slug, table_name) DO UPDATE SET settings = $3',
    [req.project.slug, `asset_${asset.id}`, asset]
  );
  res.json({ success: true });
});

// --- REALTIME ---
app.get('/api/data/:slug/realtime', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.query;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const client = await req.projectPool.connect();
  await client.query(`LISTEN "cascata_changes_${table}"`);
  client.on('notification', (msg) => res.write(`data: ${msg.payload}\n\n`));
  req.on('close', () => { client.release(); });
});

app.listen(PORT, () => console.log(`[CASCATA MASTER ENGINE] Operacional na porta ${PORT}`));
