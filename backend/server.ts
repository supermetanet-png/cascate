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

/**
 * CASCATA CORE ENGINE v3.5 - PRODUCTION GRADE
 * Sistema de Infraestrutura Multi-Tenant com Isolamento Físico e Vínculos Atômicos.
 */

const app = express();
app.use(cors() as any);
app.use(express.json({ limit: '100mb' }) as any);

const { Pool } = pg;

// Pool do Sistema - Governança Global, Projetos e Logs
const systemPool = new Pool({ 
  connectionString: process.env.SYSTEM_DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000
});

const PORT = process.env.PORT || 3000;

// Root do Storage persistente
const STORAGE_ROOT = path.resolve('storage');
if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });

const upload = multer({ dest: 'uploads/' });
const generateKey = () => crypto.randomBytes(32).toString('hex');

// --- MIDDLEWARES DE INFRAESTRUTURA ---

/**
 * Firewall: Bloqueio de IP por projeto.
 */
const firewall = async (req: any, res: any, next: NextFunction) => {
  if (!req.project) return next();
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
  if (req.project.blocklist && req.project.blocklist.includes(clientIp)) {
    return res.status(403).json({ error: 'Access denied: IP blocked by security policy.' });
  }
  next();
};

/**
 * Audit Logger: Telemetria enriquecida para o Hub de Observabilidade.
 */
const auditLogger = async (req: any, res: any, next: NextFunction) => {
  const start = Date.now();
  const oldJson = res.json;

  res.json = function(data: any) {
    const duration = Date.now() - start;
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;

    if (req.project) {
      const isInternal = req.headers.referer?.includes(req.headers.host || '');
      const authStatus = (res.statusCode >= 400) ? 'SECURITY_ALERT' : 'AUTHORIZED';

      systemPool.query(
        `INSERT INTO system.api_logs 
        (project_slug, method, path, status_code, client_ip, duration_ms, user_role, payload, headers, geo_info) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          req.project.slug, req.method, req.path, res.statusCode, clientIp, duration, 
          req.userRole || 'anonymous', JSON.stringify(req.body || {}), 
          JSON.stringify(req.headers), JSON.stringify({ is_internal: isInternal, auth_status: authStatus })
        ]
      ).catch(e => console.error('[Audit Failure]', e.message));
    }
    return oldJson.apply(res, arguments as any);
  };
  next();
};

/**
 * Project Resolver: Roteamento dinâmico de banco de dados por Tenant.
 */
const resolveProject = async (req: any, res: any, next: NextFunction) => {
  if (req.path.includes('/control/')) return next();

  const host = req.headers.host;
  const pathParts = req.path.split('/');
  const slugFromUrl = pathParts[3]; 

  try {
    let projectResult = await systemPool.query('SELECT * FROM system.projects WHERE custom_domain = $1', [host]);
    if (projectResult.rowCount === 0 && slugFromUrl) {
      projectResult = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1', [slugFromUrl]);
    }

    if (!projectResult.rows[0]) {
      if (req.path.startsWith('/api/data/')) return res.status(404).json({ error: 'Infrastructure context not found.' });
      return next();
    }

    req.project = projectResult.rows[0];
    const dbName = req.project.db_name;
    // Pool isolado para o banco de dados físico do cliente
    req.projectPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${dbName}`) });
    next();
  } catch (e) { 
    res.status(500).json({ error: 'Database context resolution failure.' }); 
  }
};

app.use(resolveProject as any);
app.use(firewall as any);
app.use(auditLogger as any);

const customDomainRewriter = (req: any, res: any, next: NextFunction) => {
  if (req.project && !req.url.startsWith('/api/data/') && !req.url.startsWith('/api/control/')) {
    req.url = `/api/data/${req.project.slug}${req.url}`;
  }
  next();
};
app.use(customDomainRewriter as any);

/**
 * Cascata Auth: Middleware de segurança multinível.
 */
const cascataAuth = async (req: any, res: any, next: NextFunction) => {
  try {
    // 1. Root Control Plane Access
    if (req.path.includes('/control/')) {
      const authHeader = req.headers['authorization'];
      if (!authHeader) return res.status(401).json({ error: 'Administrative session required' });
      const token = authHeader.split(' ')[1];
      jwt.verify(token, process.env.SYSTEM_JWT_SECRET || 'secret');
      return next();
    }

    // 2. Data Plane Access (Keys & Tokens)
    const apikey = (req.headers['apikey'] || req.query.apikey || req.headers['authorization']?.split(' ')[1])?.trim();
    const authHeader = req.headers['authorization'];
    const queryToken = req.query.token;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const activeToken = bearerToken || queryToken;

    // Prioridade: Service Role (Admin do Projeto)
    if (activeToken) {
      try {
        jwt.verify(activeToken, process.env.SYSTEM_JWT_SECRET || 'secret');
        req.userRole = 'service_role';
        return next();
      } catch (e) {}
    }

    if (apikey === req.project?.service_key) { req.userRole = 'service_role'; return next(); }
    if (apikey === req.project?.anon_key) { req.userRole = 'anon'; }

    // Authenticated User Role
    if (activeToken && req.project?.jwt_secret) {
      try {
        req.user = jwt.verify(activeToken, req.project.jwt_secret);
        req.userRole = 'authenticated';
        return next();
      } catch (e) {}
    }

    if (!req.userRole) return res.status(401).json({ error: 'Access Denied: Invalid project credentials.' });
    next();
  } catch (e) { res.status(401).json({ error: 'Authentication protocol error' }); }
};

// --- API CONTROL PLANE (STUDIO ADMIN) ---

app.post('/api/control/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
  const admin = result.rows[0];
  if (admin && admin.password_hash === password) {
    const token = jwt.sign({ sub: admin.id, role: 'admin' }, process.env.SYSTEM_JWT_SECRET || 'secret');
    res.json({ token });
  } else res.status(401).json({ error: 'Invalid Root Credentials' });
});

app.get('/api/control/me/ip', (req: any, res: any) => {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
  res.json({ ip });
});

app.get('/api/control/projects', cascataAuth as any, async (req, res) => {
  const result = await systemPool.query('SELECT * FROM system.projects ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/control/projects', cascataAuth as any, async (req, res) => {
  const { name, slug } = req.body;
  const db_name = `cascata_db_${slug.replace(/-/g, '_')}`;
  try {
    await systemPool.query(`CREATE DATABASE ${db_name}`);
    const result = await systemPool.query(
      `INSERT INTO system.projects (name, slug, db_name, anon_key, service_key, jwt_secret) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, slug, db_name, generateKey(), generateKey(), generateKey()]
    );
    const tempPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${db_name}`) });
    await tempPool.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT UNIQUE, password_hash TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
    `);
    await tempPool.end();
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/control/projects/:slug', cascataAuth as any, async (req: any, res: any) => {
  const { name, custom_domain, metadata } = req.body;
  const result = await systemPool.query(
    'UPDATE system.projects SET name = COALESCE($1, name), custom_domain = COALESCE($2, custom_domain), metadata = COALESCE($3, metadata) WHERE slug = $4 RETURNING *',
    [name, custom_domain, metadata ? JSON.stringify(metadata) : null, req.params.slug]
  );
  res.json(result.rows[0]);
});

app.post('/api/control/projects/:slug/block-ip', cascataAuth as any, async (req, res) => {
  const { ip } = req.body;
  await systemPool.query('UPDATE system.projects SET blocklist = array_append(blocklist, $1) WHERE slug = $2 AND NOT ($1 = ANY(blocklist))', [ip, req.params.slug]);
  res.json({ success: true });
});

app.post('/api/control/projects/:slug/unblock-ip', cascataAuth as any, async (req, res) => {
  const { ip } = req.body;
  await systemPool.query(
    'UPDATE system.projects SET blocklist = array_remove(blocklist, $1) WHERE slug = $2',
    [ip, req.params.slug]
  );
  res.json({ success: true });
});

app.delete('/api/control/projects/:slug/logs', cascataAuth as any, async (req: any, res: any) => {
  const { days } = req.query;
  await systemPool.query('DELETE FROM system.api_logs WHERE project_slug = $1 AND created_at < now() - $2::interval', [req.params.slug, `${days} days`]);
  res.json({ success: true });
});

app.patch('/api/control/projects/:slug/settings', cascataAuth as any, async (req, res) => {
  const { log_retention_days } = req.body;
  await systemPool.query('UPDATE system.projects SET log_retention_days = $1 WHERE slug = $2', [log_retention_days, req.params.slug]);
  res.json({ success: true });
});

app.get('/api/control/projects/:slug/webhooks', cascataAuth as any, async (req, res) => {
  const result = await systemPool.query('SELECT * FROM system.webhooks WHERE project_slug = $1 ORDER BY created_at DESC', [req.params.slug]);
  res.json(result.rows);
});

app.post('/api/control/projects/:slug/webhooks', cascataAuth as any, async (req, res) => {
  const { target_url, event_type, table_name } = req.body;
  const result = await systemPool.query(
    'INSERT INTO system.webhooks (project_slug, target_url, event_type, table_name) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.params.slug, target_url, event_type, table_name]
  );
  res.json(result.rows[0]);
});

// --- API DATA PLANE: AUTH & IDENTITY (VÍNCULO ATÔMICO) ---

/**
 * Listagem de usuários com paginação e filtro por tabela de perfil.
 */
app.get('/api/data/:slug/auth/users', cascataAuth as any, async (req: any, res: any) => {
  try {
    const limit = req.query.limit === 'all' ? 1000000 : parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const filterTable = req.query.table || null;

    let query = 'SELECT id, email, created_at FROM auth.users WHERE email LIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3';
    let params: any[] = [search, limit, offset];

    if (filterTable) {
      query = `
        SELECT u.id, u.email, u.created_at 
        FROM auth.users u
        JOIN public."${filterTable}" p ON u.id = p.id
        WHERE u.email LIKE $1
        ORDER BY u.created_at DESC
        LIMIT $2 OFFSET $3
      `;
    }

    const result = await req.projectPool.query(query, params);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * Criação Atômica de Usuário: Garante que o ID no Auth seja idêntico ao ID na Tabela Pública (RLS-Ready).
 */
app.post('/api/data/:slug/auth/users', cascataAuth as any, async (req: any, res: any) => {
  const { email, password, target_table } = req.body;
  const client = await req.projectPool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query('INSERT INTO auth.users (email, password_hash) VALUES ($1, $2) RETURNING id', [email, password]);
    const userId = userRes.rows[0].id;

    // Vínculo automático baseado no mapeamento ou na seleção direta
    const mapping = req.project.metadata?.user_table_mapping;
    const tableToLink = target_table || mapping?.principal_table;

    if (tableToLink) {
      await client.query(`INSERT INTO public."${tableToLink}" (id, email) VALUES ($1, $2)`, [userId, email]);
    }

    await client.query('COMMIT');
    res.json({ id: userId, email, success: true });
  } catch (e: any) { 
    await client.query('ROLLBACK'); 
    res.status(400).json({ error: `Falha no vínculo atômico: ${e.message}` }); 
  } finally { client.release(); }
});

/**
 * FIX 500: Salvamento seguro de mapeamento de tabelas.
 */
app.post('/api/data/:slug/auth/mapping', cascataAuth as any, async (req: any, res: any) => {
  try {
    const { principal_table, additional_tables } = req.body;
    
    // Busca metadados atuais para garantir que não vamos sobrescrever outras áreas (como storage)
    const projectRes = await systemPool.query('SELECT metadata FROM system.projects WHERE slug = $1', [req.params.slug]);
    if (projectRes.rowCount === 0) return res.status(404).json({ error: 'Project not found.' });

    const currentMetadata = projectRes.rows[0].metadata || {};
    const updatedMetadata = {
      ...currentMetadata,
      user_table_mapping: { principal_table, additional_tables }
    };

    await systemPool.query(
      'UPDATE system.projects SET metadata = $1 WHERE slug = $2',
      [JSON.stringify(updatedMetadata), req.params.slug]
    );

    res.json({ success: true });
  } catch (e: any) {
    console.error('[Mapping Error]', e);
    res.status(500).json({ error: 'Falha interna ao sincronizar arquitetura de mapeamento.' });
  }
});

app.patch('/api/data/:slug/auth/users/:id', cascataAuth as any, async (req: any, res: any) => {
  const { email, password } = req.body;
  try {
    if (email) await req.projectPool.query('UPDATE auth.users SET email = $1 WHERE id = $2', [email, req.params.id]);
    if (password) await req.projectPool.query('UPDATE auth.users SET password_hash = $1 WHERE id = $2', [password, req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/data/:slug/auth/users/:id', cascataAuth as any, async (req: any, res: any) => {
  try {
    await req.projectPool.query('DELETE FROM auth.users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- API DATA PLANE: DATABASE EXPLORER ---

app.get('/api/data/:slug/tables', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query("SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
  res.json(result.rows);
});

app.get('/api/data/:slug/tables/:table/columns', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(
    `SELECT column_name as name, data_type as type, is_nullable = 'YES' as "isNullable", 
    EXISTS (SELECT 1 FROM information_schema.key_column_usage kcu WHERE kcu.table_name = $1 AND kcu.column_name = c.column_name) as "isPrimaryKey" 
    FROM information_schema.columns c WHERE table_name = $1`, [req.params.table]
  );
  res.json(result.rows);
});

app.get('/api/data/:slug/tables/:table/data', cascataAuth as any, async (req: any, res: any) => {
  try {
    const result = await req.projectPool.query(`SELECT * FROM public."${req.params.table}" LIMIT 1000`);
    res.json(result.rows);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/tables', cascataAuth as any, async (req: any, res: any) => {
  const { name, columns } = req.body;
  const colsSql = columns.map((c: any) => `"${c.name}" ${c.type} ${c.primaryKey ? 'PRIMARY KEY' : ''} ${c.nullable === false ? 'NOT NULL' : ''} ${c.default ? `DEFAULT ${c.default}` : ''}`).join(', ');
  const sql = `CREATE TABLE public."${name}" (${colsSql});`;
  try { await req.projectPool.query(sql); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/data/:slug/tables/:table', cascataAuth as any, async (req: any, res: any) => {
  try { await req.projectPool.query(`DROP TABLE public."${req.params.table}" CASCADE`); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/tables/:table/rows', cascataAuth as any, async (req: any, res: any) => {
  const { data } = req.body;
  const cols = Object.keys(data).map(k => `"${k}"`).join(',');
  const placeholders = Object.keys(data).map((_, i) => `$${i + 1}`).join(',');
  try {
    await req.projectPool.query(`INSERT INTO public."${req.params.table}" (${cols}) VALUES (${placeholders})`, Object.values(data));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.put('/api/data/:slug/tables/:table/rows', cascataAuth as any, async (req: any, res: any) => {
  const { data, pkColumn, pkValue } = req.body;
  const keys = Object.keys(data).filter(k => k !== pkColumn);
  const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
  const values = [...keys.map(k => data[k]), pkValue];
  try { await req.projectPool.query(`UPDATE public."${req.params.table}" SET ${setClause} WHERE "${pkColumn}" = $${values.length}`, values); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/tables/:table/delete-rows', cascataAuth as any, async (req: any, res: any) => {
  const { ids, pkColumn } = req.body;
  try { await req.projectPool.query(`DELETE FROM public."${req.params.table}" WHERE "${pkColumn}" = ANY($1)`, [ids]); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/query', cascataAuth as any, async (req: any, res: any) => {
  const start = Date.now();
  try {
    const result = await req.projectPool.query(req.body.sql);
    res.json({ ...result, duration: Date.now() - start });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/data/:slug/functions', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT routine_name as name, routine_type as type FROM information_schema.routines WHERE routine_schema = 'public'`);
  res.json(result.rows);
});

app.get('/api/data/:slug/triggers', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT trigger_name as name, event_manipulation as event, event_object_table as table FROM information_schema.triggers WHERE trigger_schema = 'public'`);
  res.json(result.rows);
});

// --- API DATA PLANE: RLS POLICIES ---

app.get('/api/data/:slug/policies', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT policyname, tablename, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'`);
  res.json(result.rows);
});

app.post('/api/data/:slug/policies', cascataAuth as any, async (req: any, res: any) => {
  const { name, table, command, role, using, withCheck } = req.body;
  const sql = `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY; 
               CREATE POLICY "${name}" ON public."${table}" FOR ${command} TO ${role} USING (${using}) ${withCheck ? `WITH CHECK (${withCheck})` : ''};`;
  try { await req.projectPool.query(sql); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/data/:slug/policies/:table/:name', cascataAuth as any, async (req: any, res: any) => {
  try { await req.projectPool.query(`DROP POLICY "${req.params.name}" ON public."${req.params.table}"`); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- STORAGE ENGINE CORE ---

const validateGovernance = (req: any, fileName: string, fileSize: number) => {
  const governance = req.project.metadata?.storage_governance;
  if (!governance) return { allowed: true };

  const ext = path.extname(fileName).toLowerCase().replace('.', '');
  let matchedSector: any = null;
  
  for (const [sectorId, config] of Object.entries(governance) as any) {
    if (sectorId !== 'global' && config.allowed_exts?.includes(ext)) {
      matchedSector = config;
      break;
    }
  }

  const policy = matchedSector || governance.global || { max_size: '100MB', allowed_exts: [] };
  
  const parseSize = (s: string) => {
    const num = parseFloat(s);
    if (s.includes('TB')) return num * 1024 * 1024 * 1024 * 1024;
    if (s.includes('GB')) return num * 1024 * 1024 * 1024;
    if (s.includes('MB')) return num * 1024 * 1024;
    if (s.includes('KB')) return num * 1024;
    return num;
  };

  const maxBytes = parseSize(policy.max_size);

  if (matchedSector && !policy.allowed_exts?.includes(ext)) {
    return { allowed: false, error: `Extensão .${ext} desabilitada pela política de governança.` };
  }
  if (fileSize > maxBytes) {
    return { allowed: false, error: `Tamanho excede o limite de ${policy.max_size} para este setor.` };
  }
  return { allowed: true };
};

// --- API DATA PLANE: STORAGE ---

app.get('/api/data/:slug/storage/buckets', cascataAuth as any, async (req: any, res: any) => {
  const p = path.join(STORAGE_ROOT, req.project.slug);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  res.json(fs.readdirSync(p).filter(f => fs.lstatSync(path.join(p, f)).isDirectory()).map(name => ({ name })));
});

app.post('/api/data/:slug/storage/buckets', cascataAuth as any, async (req: any, res: any) => {
  const { name } = req.body;
  const p = path.join(STORAGE_ROOT, req.project.slug, name);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  res.json({ success: true });
});

app.get('/api/data/:slug/storage/:bucket/list', cascataAuth as any, async (req: any, res: any) => {
  const p = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, req.query.path as string || '');
  if (!fs.existsSync(p)) return res.json({ items: [] });
  const items = fs.readdirSync(p).map(name => {
    const s = fs.statSync(path.join(p, name));
    return { name, type: s.isDirectory() ? 'folder' : 'file', size: s.size, updated_at: s.mtime, path: path.join(req.query.path as string || '', name) };
  });
  res.json({ items });
});

app.post('/api/data/:slug/storage/:bucket/folder', cascataAuth as any, async (req: any, res: any) => {
  const { name, path: targetPath } = req.body;
  const p = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, targetPath || '', name);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  res.json({ success: true });
});

app.post('/api/data/:slug/storage/:bucket/duplicate', cascataAuth as any, async (req: any, res: any) => {
  const { targetPath } = req.body;
  const source = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, targetPath);
  
  if (!fs.existsSync(source)) return res.status(404).json({ error: 'Source not found' });

  const ext = path.extname(targetPath);
  const base = targetPath.replace(ext, '');
  const dest = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, `${base}_copy_${Date.now()}${ext}`);

  try {
    if (fs.lstatSync(source).isDirectory()) {
      fs.cpSync(source, dest, { recursive: true });
    } else {
      fs.copyFileSync(source, dest);
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/data/:slug/storage/:bucket/upload', cascataAuth as any, upload.single('file') as any, async (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ error: 'Empty file payload' });

  const validation = validateGovernance(req, req.file.originalname, req.file.size);
  if (!validation.allowed) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: validation.error });
  }

  const dest = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, req.body.path || '', req.file.originalname);
  if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(req.file.path, dest);
  res.json({ success: true, name: req.file.originalname });
});

app.patch('/api/data/:slug/storage/:bucket/object', cascataAuth as any, async (req: any, res: any) => {
  const { oldPath, newPath } = req.body;
  const oldFull = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, oldPath);
  const newFull = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, newPath);
  
  if (fs.existsSync(oldFull)) {
    if (!fs.existsSync(path.dirname(newFull))) fs.mkdirSync(path.dirname(newFull), { recursive: true });
    fs.renameSync(oldFull, newFull);
    res.json({ success: true });
  } else res.status(404).json({ error: 'Not found' });
});

app.delete('/api/data/:slug/storage/:bucket/object', cascataAuth as any, async (req: any, res: any) => {
  const target = req.query.path as string;
  const full = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, target);
  if (fs.existsSync(full)) {
    if (fs.lstatSync(full).isDirectory()) fs.rmSync(full, { recursive: true });
    else fs.unlinkSync(full);
    res.json({ success: true });
  } else res.status(404).json({ error: 'Not found' });
});

app.get('/api/data/:slug/storage/:bucket/object/:path(*)', cascataAuth as any, async (req: any, res: any) => {
  const full = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, req.params.path);
  if (fs.existsSync(full) && !fs.lstatSync(full).isDirectory()) {
    res.sendFile(full);
  } else res.status(404).json({ error: 'Not found' });
});

// --- API DATA PLANE: ASSETS (RPC & TRIGGERS) ---

app.get('/api/data/:slug/assets', cascataAuth as any, async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.assets WHERE project_slug = $1 ORDER BY created_at ASC', [req.params.slug]);
  res.json(result.rows);
});

app.post('/api/data/:slug/assets', cascataAuth as any, async (req: any, res: any) => {
  const { id, name, type, parent_id, metadata } = req.body;
  if (id) {
    const r = await systemPool.query('UPDATE system.assets SET name = $1, metadata = $2 WHERE id = $3 RETURNING *', [name, metadata, id]);
    res.json(r.rows[0]);
  } else {
    const r = await systemPool.query('INSERT INTO system.assets (project_slug, name, type, parent_id, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *', [req.params.slug, name, type, parent_id, metadata]);
    res.json(r.rows[0]);
  }
});

app.delete('/api/data/:slug/assets/:id', cascataAuth as any, async (req: any, res: any) => {
  await systemPool.query('DELETE FROM system.assets WHERE id = $1 AND project_slug = $2', [req.params.id, req.project.slug]);
  res.json({ success: true });
});

app.post('/api/data/:slug/rpc/:name', cascataAuth as any, async (req: any, res: any) => {
  const params = req.body;
  const keys = Object.keys(params);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `SELECT * FROM public."${req.params.name}"(${placeholders})`;
  try {
    const result = await req.projectPool.query(sql, Object.values(params));
    res.json(result.rows);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/data/:slug/stats', cascataAuth as any, async (req: any, res: any) => {
  try {
    const tables = await req.projectPool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
    const users = await req.projectPool.query("SELECT count(*) FROM auth.users").catch(() => ({ rows: [{ count: 0 }] }));
    const size = await req.projectPool.query("SELECT pg_size_pretty(pg_database_size(current_database()))");
    res.json({ tables: parseInt(tables.rows[0].count), users: parseInt(users.rows[0].count), size: size.rows[0].pg_size_pretty });
  } catch (e) { res.json({ tables: 0, users: 0, size: '0 MB' }); }
});

app.get('/api/data/:slug/logs', cascataAuth as any, async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.api_logs WHERE project_slug = $1 ORDER BY created_at DESC LIMIT 200', [req.project.slug]);
  res.json(result.rows);
});

app.get('/api/data/:slug/ui-settings/:table', cascataAuth as any, async (req: any, res: any) => {
  const r = await systemPool.query('SELECT settings FROM system.ui_settings WHERE project_slug = $1 AND table_name = $2', [req.params.slug, req.params.table]);
  res.json(r.rows[0]?.settings || {});
});

app.post('/api/data/:slug/ui-settings/:table', cascataAuth as any, async (req: any, res: any) => {
  await systemPool.query('INSERT INTO system.ui_settings (project_slug, table_name, settings) VALUES ($1, $2, $3) ON CONFLICT (project_slug, table_name) DO UPDATE SET settings = $3', [req.params.slug, req.params.table, JSON.stringify(req.body.settings)]);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`[CASCATA MASTER ENGINE] v3.5 Online on port ${PORT}`));