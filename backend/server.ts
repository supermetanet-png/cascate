
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

// Root de armazenamento físico
const STORAGE_ROOT = path.join(process.cwd(), 'storage');
if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });

const upload = multer({ dest: 'uploads/' });

// --- HELPERS DE SEGURANÇA ---
const generateKey = () => crypto.randomBytes(32).toString('hex');

// --- MIDDLEWARES DE CORE ---

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
    
    // Pool dinâmico isolado por base de dados
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
  // 1. Controle (Studio) - Usa o Secret Global do Sistema
  if (req.path.includes('/control/')) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Admin JWT required' });
    try {
      const token = authHeader.split(' ')[1];
      jwt.verify(token, process.env.SYSTEM_JWT_SECRET || 'secret');
      return next();
    } catch (e) { return res.status(401).json({ error: 'Invalid Admin Session' }); }
  }

  // 2. Dados (API do Projeto) - Usa as chaves do projeto
  const apikey = req.headers['apikey'] || req.query.apikey;
  if (!apikey) return res.status(401).json({ error: 'API Key required' });

  // Service Role: Acesso total (Bypass RLS)
  if (apikey === req.project?.service_key) { 
    req.userRole = 'service_role'; 
    return next(); 
  }

  // Anon / Authenticated Role
  if (apikey === req.project?.anon_key) { 
    req.userRole = 'anon';
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        // Valida contra o secret específico do projeto
        const decoded = jwt.verify(token, req.project.jwt_secret);
        req.user = decoded;
        req.userRole = 'authenticated';
      } catch (e) {}
    }
    return next(); 
  }
  
  res.status(401).json({ error: 'Invalid API Key for this instance' });
};

// --- CONTROL PLANE: GESTÃO DE INFRAESTRUTURA ---

app.post('/api/control/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
  const admin = result.rows[0];
  if (admin && admin.password_hash === password) { // Usar bcrypt em prod
    const token = jwt.sign({ sub: admin.id, role: 'admin' }, process.env.SYSTEM_JWT_SECRET || 'secret');
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid admin credentials' });
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
    // Provisionamento físico
    await systemPool.query(`CREATE DATABASE ${db_name}`);
    
    const anon_key = generateKey();
    const service_key = generateKey();
    const jwt_secret = generateKey();

    const result = await systemPool.query(
      `INSERT INTO system.projects (name, slug, db_name, anon_key, service_key, jwt_secret) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, slug, db_name, anon_key, service_key, jwt_secret]
    );

    // Setup inicial do banco do projeto
    const tempPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${db_name}`) });
    await tempPool.query('CREATE SCHEMA IF NOT EXISTS auth');
    await tempPool.query(`
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      )
    `);
    await tempPool.end();

    // Storage directory
    const projDir = path.join(STORAGE_ROOT, slug);
    if (!fs.existsSync(projDir)) fs.mkdirSync(projDir, { recursive: true });

    res.json(result.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- DATA PLANE: EXPLORAÇÃO E METADADOS ---

app.get('/api/data/:slug/stats', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const tables = await req.projectPool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
  const users = await req.projectPool.query("SELECT count(*) FROM auth.users").catch(() => ({ rows: [{ count: 0 }] }));
  const size = await req.projectPool.query("SELECT pg_size_pretty(pg_database_size(current_database()))");
  res.json({ 
    tables: parseInt(tables.rows[0].count), 
    users: parseInt(users.rows[0].count), 
    size: size.rows[0].pg_size_pretty 
  });
});

app.get('/api/data/:slug/tables', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`
    SELECT table_name as name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  res.json(result.rows);
});

app.get('/api/data/:slug/tables/:table/columns', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.params;
  const result = await req.projectPool.query(`
    SELECT column_name as name, data_type as type, is_nullable = 'YES' as nullable,
           EXISTS (SELECT 1 FROM information_schema.key_column_usage kcu 
                   WHERE kcu.table_name = $1 AND kcu.column_name = c.column_name) as "isPrimaryKey"
    FROM information_schema.columns c WHERE table_name = $1
  `, [table]);
  res.json(result.rows);
});

// --- CRUD: OPERAÇÕES DE DADOS ---

app.get('/api/data/:slug/tables/:table/data', resolveProject as any, cascataAuth as any, auditLogger as any, async (req: any, res: any) => {
  const { table } = req.params;
  const client = await req.projectPool.connect();
  try {
    if (req.userRole !== 'service_role') {
      await client.query(`SET LOCAL auth.uid = '${req.user?.sub || ''}'`);
    }
    const result = await client.query(`SELECT * FROM public."${table}" LIMIT 100`);
    res.json(result.rows);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/api/data/:slug/tables/:table/rows', resolveProject as any, cascataAuth as any, auditLogger as any, async (req: any, res: any) => {
  const { table } = req.params;
  const { data } = req.body;
  const keys = Object.keys(data);
  const values = Object.values(data);
  const cols = keys.map(k => `"${k}"`).join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

  try {
    const result = await req.projectPool.query(
      `INSERT INTO public."${table}" (${cols}) VALUES (${placeholders}) RETURNING *`, 
      values
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/data/:slug/tables/:table/rows', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.params;
  const { pkColumn, pkValue } = req.body;
  try {
    await req.projectPool.query(`DELETE FROM public."${table}" WHERE "${pkColumn}" = $1`, [pkValue]);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- RPC ENGINE: CHAMADAS DE LÓGICA ---

app.get('/api/data/:slug/functions', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`
    SELECT routine_name as name, data_type as return_type 
    FROM information_schema.routines 
    WHERE routine_schema = 'public'
  `);
  res.json(result.rows);
});

app.post('/api/data/:slug/rpc/:name', resolveProject as any, cascataAuth as any, auditLogger as any, async (req: any, res: any) => {
  const { name } = req.params;
  const params = req.body; // { param1: val1 }
  const keys = Object.keys(params);
  const values = Object.values(params);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

  try {
    const query = `SELECT * FROM public."${name}"(${placeholders})`;
    const result = await req.projectPool.query(query, values);
    res.json(result.rows);
  } catch (e: any) {
    res.status(400).json({ error: `Execution Error: ${e.message}` });
  }
});

// --- AUTH ENGINE: USUÁRIOS FINAIS ---

app.post('/api/data/:slug/auth/signup', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { email, password } = req.body;
  try {
    const result = await req.projectPool.query(
      'INSERT INTO auth.users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, password] // Usar bcrypt em prod
    );
    // Fix: result.rows[0] used instead of undefined 'user'
    res.json(result.rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/auth/login', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { email, password } = req.body;
  try {
    const result = await req.projectPool.query('SELECT * FROM auth.users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (user && user.password_hash === password) {
      const token = jwt.sign(
        { sub: user.id, email: user.email, role: 'authenticated' }, 
        req.project.jwt_secret,
        { expiresIn: '24h' }
      );
      res.json({ token, user: { id: user.id, email: user.email } });
    } else {
      res.status(401).json({ error: 'Invalid user credentials' });
    }
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- STORAGE ENGINE: OBJETOS ---

app.get('/api/data/:slug/storage/buckets', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const projDir = path.join(STORAGE_ROOT, req.project.slug);
  if (!fs.existsSync(projDir)) fs.mkdirSync(projDir, { recursive: true });
  const buckets = fs.readdirSync(projDir).filter(f => fs.lstatSync(path.join(projDir, f)).isDirectory());
  res.json(buckets.map(b => ({ name: b })));
});

app.post('/api/data/:slug/storage/buckets', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { name } = req.body;
  const bucketDir = path.join(STORAGE_ROOT, req.project.slug, name);
  if (!fs.existsSync(bucketDir)) fs.mkdirSync(bucketDir, { recursive: true });
  res.json({ success: true });
});

// Fix: casted upload.single('file') to any to resolve RequestHandler mismatch
app.post('/api/data/:slug/storage/:bucket/upload', resolveProject as any, cascataAuth as any, upload.single('file') as any, async (req: any, res: any) => {
  const { bucket } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const dest = path.join(STORAGE_ROOT, req.project.slug, bucket, req.file.originalname);
  fs.renameSync(req.file.path, dest);
  res.json({ success: true, url: `/api/data/${req.project.slug}/storage/${bucket}/object/${req.file.originalname}` });
});

app.get('/api/data/:slug/storage/:bucket/object/:path(*)', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { bucket, path: filePath } = req.params;
  const fullPath = path.join(STORAGE_ROOT, req.project.slug, bucket, filePath);
  if (fs.existsSync(fullPath)) {
    res.sendFile(fullPath);
  } else {
    res.status(404).send('Not found');
  }
});

// --- SISTEMA E METADADOS ---

app.post('/api/data/:slug/ui-settings/:table', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.params;
  const { settings } = req.body;
  await systemPool.query(
    'INSERT INTO system.ui_settings (project_slug, table_name, settings) VALUES ($1, $2, $3) ON CONFLICT (project_slug, table_name) DO UPDATE SET settings = $3',
    [req.project.slug, table, settings]
  );
  res.json({ success: true });
});

app.get('/api/data/:slug/ui-settings/:table', resolveProject as any, cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.params;
  const result = await systemPool.query('SELECT settings FROM system.ui_settings WHERE project_slug = $1 AND table_name = $2', [req.project.slug, table]);
  res.json(result.rows[0]?.settings || {});
});

app.listen(PORT, () => console.log(`[CASCATA MASTER ENGINE] Ativo e Protegido na porta ${PORT}`));
