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

const STORAGE_ROOT = path.resolve('storage');
if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });

const upload = multer({ dest: 'uploads/' });
const generateKey = () => crypto.randomBytes(32).toString('hex');

// --- MIDDLEWARES ---

// Firewall de IP e Segurança
const firewall = async (req: any, res: any, next: NextFunction) => {
  if (!req.project) return next();
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (req.project.blocklist && req.project.blocklist.includes(clientIp)) {
    return res.status(403).json({ error: 'Access denied by security policy (IP Blocked)' });
  }
  next();
};

const auditLogger = async (req: any, res: any, next: NextFunction) => {
  const start = Date.now();
  const oldJson = res.json;

  res.json = function(data: any) {
    const duration = Date.now() - start;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Detecta se a requisição é interna do Studio (Referer corresponde ao Host)
    const isInternal = req.headers.referer?.includes(req.headers.host || '') || false;

    if (req.project) {
      // Auditoria enriquecida para detectar falhas de autenticação
      const authStatus = res.statusCode === 401 || res.statusCode === 403 ? 'SECURITY_ALERT' : 'AUTHORIZED';

      systemPool.query(
        `INSERT INTO system.api_logs 
        (project_slug, method, path, status_code, client_ip, duration_ms, user_role, payload, headers, user_agent, geo_info) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          req.project.slug, 
          req.method, 
          req.path, 
          res.statusCode, 
          clientIp, 
          duration, 
          req.userRole || 'unauthorized',
          JSON.stringify(req.body || {}),
          JSON.stringify({ 
            referer: req.headers.referer, 
            origin: req.headers.origin,
            host: req.headers.host 
          }),
          req.headers['user-agent'],
          JSON.stringify({ 
            is_internal: isInternal,
            auth_status: authStatus,
            attempted_at: new Date().toISOString()
          })
        ]
      ).catch(e => console.error('Logging failed', e));
    }
    return oldJson.apply(res, arguments as any);
  };
  next();
};

const resolveProject = async (req: any, res: any, next: NextFunction) => {
  if (req.path.includes('/control/')) return next();

  const host = req.headers.host;
  const pathParts = req.path.split('/');
  const slugFromUrl = pathParts[3]; 

  try {
    let projectResult;
    projectResult = await systemPool.query('SELECT * FROM system.projects WHERE custom_domain = $1', [host]);
    
    if (projectResult.rowCount === 0 && slugFromUrl) {
      projectResult = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1', [slugFromUrl]);
    }

    if (!projectResult.rows[0]) {
      // Bloqueio imediato 404 para rotas de dados sem projeto válido
      if (req.path.startsWith('/api/data/')) return res.status(404).json({ error: 'Project infrastructure context not found.' });
      return next();
    }

    req.project = projectResult.rows[0];
    const dbName = req.project.db_name;
    req.projectPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${dbName}`) });
    next();
  } catch (e) { 
    res.status(500).json({ error: 'Critical DB Resolution Error' }); 
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
 * Middleware de Autenticação Cascata v3.0 (Zero Trust)
 * - Implementa rejeição por padrão
 * - Validação estrita de chaves vinculadas ao projeto
 * - Normalização de headers e suporte a acesso mestre via Studio
 * - Correção: Prioriza Authorization: Bearer para chamadas do Studio, garantindo privilégio de "Acesso Mestre"
 * - SOLUÇÃO: Aceita token via query string para visualização de arquivos no navegador
 */
const cascataAuth = async (req: any, res: any, next: NextFunction) => {
  // 1. Tratamento de Rotas do Plano de Controle (Admin Studio)
  if (req.path.includes('/control/')) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Administrative Session Required' });
    try {
      const token = authHeader.split(' ')[1];
      jwt.verify(token, process.env.SYSTEM_JWT_SECRET || 'secret');
      return next();
    } catch (e) { return res.status(401).json({ error: 'Invalid or Expired Admin Session' }); }
  }

  // 2. Tratamento de Rotas do Plano de Dados (API de Projetos)
  // Sanitização de chaves e normalização de transporte
  const apikeyRaw = req.headers['apikey'] || req.query.apikey;
  const authHeader = req.headers['authorization'];
  const bearerToken = (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null)?.trim();
  
  // SOLUÇÃO: Aceita token via query string para visualização de arquivos no navegador
  const queryToken = req.query.token;
  const apikey = (apikeyRaw || bearerToken || queryToken)?.trim();

  // Verificação de Acesso Mestre (Admin do Studio acessando dados do projeto via Bearer)
  if (bearerToken || queryToken) {
    try {
      // Se o token for um JWT válido do sistema, concede privilégios de service_role para o Studio
      jwt.verify((bearerToken || queryToken), process.env.SYSTEM_JWT_SECRET || 'secret');
      req.userRole = 'service_role';
      return next();
    } catch (e) {
      // Se não for admin, segue para verificação de chaves do projeto
    }
  }

  // Validação Estrita vinculada ao Contexto do Projeto (req.project)
  if (apikey === req.project?.service_key) {
    req.userRole = 'service_role';
    return next();
  }

  if (apikey === req.project?.anon_key) {
    req.userRole = 'anon';
    // Se for apenas anon key, continua para ver se há um JWT de usuário autenticado
  }

  // Verificação de JWT de Usuário do Projeto (auth.users)
  if ((bearerToken || queryToken) && req.project?.jwt_secret) {
    try {
      const decoded = jwt.verify((bearerToken || queryToken), req.project.jwt_secret);
      req.user = decoded; 
      req.userRole = 'authenticated';
      return next();
    } catch (e) {
      // JWT inválido, mas se tiver anon_key válida, continua como anon
    }
  }

  // Rejeição por Padrão (Strict Gate)
  if (!req.userRole) {
    return res.status(401).json({ 
      error: 'Access Denied: Invalid API Key or Authorization Token for this project context.' 
    });
  }

  // Caso tenha caído como anon (e não retornou via service_role ou authenticated)
  next();
};

// --- CONTROL PLANE EXTENSIONS ---

// Helper para descobrir IP atual do usuário
// Fix: Explicitly use 'any' type for req and res parameters to resolve ambiguous 'Request' and 'Response' type definitions and ensure access to standard express properties.
app.get('/api/control/me/ip', (req: any, res: any) => {
  const ip = req.headers['x-forwarded-for'] || (req as any).socket?.remoteAddress;
  res.json({ ip });
});

// Bloquear IP
app.post('/api/control/projects/:slug/block-ip', cascataAuth as any, async (req, res) => {
  const { ip } = req.body;
  await systemPool.query(
    'UPDATE system.projects SET blocklist = array_append(blocklist, $1) WHERE slug = $2 AND NOT ($1 = ANY(blocklist))',
    [ip, req.params.slug]
  );
  res.json({ success: true });
});

// Desbloquear IP
app.post('/api/control/projects/:slug/unblock-ip', cascataAuth as any, async (req, res) => {
  const { ip } = req.body;
  await systemPool.query(
    'UPDATE system.projects SET blocklist = array_remove(blocklist, $1) WHERE slug = $2',
    [ip, req.params.slug]
  );
  res.json({ success: true });
});

// Limpeza de Logs
app.delete('/api/control/projects/:slug/logs', cascataAuth as any, async (req, res) => {
  const { days } = req.query;
  const interval = `${days} days`;
  await systemPool.query(
    'DELETE FROM system.api_logs WHERE project_slug = $1 AND created_at < now() - $2::interval',
    [req.params.slug, interval]
  );
  res.json({ success: true });
});

// Configurar Retenção
app.patch('/api/control/projects/:slug/settings', cascataAuth as any, async (req, res) => {
  const { log_retention_days } = req.body;
  await systemPool.query('UPDATE system.projects SET log_retention_days = $1 WHERE slug = $2', [log_retention_days, req.params.slug]);
  res.json({ success: true });
});

// --- AUTH E PROJETOS ---

app.post('/api/control/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
  const admin = result.rows[0];
  if (admin && admin.password_hash === password) {
    const token = jwt.sign({ sub: admin.id, role: 'admin' }, process.env.SYSTEM_JWT_SECRET || 'secret');
    res.json({ token });
  } else res.status(401).json({ error: 'Invalid admin credentials' });
});

app.get('/api/control/projects', cascataAuth as any, async (req, res) => {
  const result = await systemPool.query('SELECT * FROM system.projects ORDER BY created_at DESC');
  res.json(result.rows);
});

app.patch('/api/control/projects/:slug', cascataAuth as any, async (req: any, res: any) => {
  const { name, custom_domain } = req.body;
  try {
    const result = await systemPool.query(
      'UPDATE system.projects SET name = COALESCE($1, name), custom_domain = COALESCE($2, custom_domain), updated_at = now() WHERE slug = $3 RETURNING *',
      [name, custom_domain, req.params.slug]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/control/projects', cascataAuth as any, async (req: any, res: any) => {
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
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
        email TEXT UNIQUE, 
        password_hash TEXT, 
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
    await tempPool.end();
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
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

// --- DATA PLANE STORAGE EXTENDED ---

// Listar Buckets (Pastas raiz)
app.get('/api/data/:slug/storage/buckets', cascataAuth as any, async (req: any, res: any) => {
  const p = path.join(STORAGE_ROOT, req.project.slug);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  const items = fs.readdirSync(p).filter(f => fs.lstatSync(path.join(p, f)).isDirectory());
  res.json(items.map(name => ({ name })));
});

// Criar Bucket
app.post('/api/data/:slug/storage/buckets', cascataAuth as any, async (req: any, res: any) => {
  const { name } = req.body;
  const p = path.join(STORAGE_ROOT, req.project.slug, name);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  res.json({ success: true });
});

// Listar Conteúdo (Arquivos e Subpastas)
app.get('/api/data/:slug/storage/:bucket/list', cascataAuth as any, async (req: any, res: any) => {
  const subPath = req.query.path || '';
  const p = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, subPath as string);
  if (!fs.existsSync(p)) return res.json({ items: [] });
  
  const items = fs.readdirSync(p).map(name => {
    const full = path.join(p, name);
    const stat = fs.statSync(full);
    return {
      name,
      type: stat.isDirectory() ? 'folder' : 'file',
      size: stat.size,
      updated_at: stat.mtime,
      path: path.join(subPath as string, name)
    };
  });
  res.json({ items });
});

// Criar Pasta
app.post('/api/data/:slug/storage/:bucket/folder', cascataAuth as any, async (req: any, res: any) => {
  const { name, path: targetPath } = req.body;
  const p = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, targetPath || '', name);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  res.json({ success: true });
});

// Duplicar Objeto (Arquivo ou Pasta)
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

// Renomear (Arquivo ou Pasta)
app.patch('/api/data/:slug/storage/:bucket/rename', cascataAuth as any, async (req: any, res: any) => {
  const { oldPath, newName } = req.body;
  const oldFull = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, oldPath);
  const dirName = path.dirname(oldPath);
  const newFull = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, dirName, newName);

  if (fs.existsSync(oldFull)) {
    try {
      fs.renameSync(oldFull, newFull);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  } else res.status(404).json({ error: 'Target not found' });
});

// Download Zip (Simulado - Requer implementação de stream de zip no ambiente)
app.get('/api/data/:slug/storage/:bucket/zip', cascataAuth as any, async (req: any, res: any) => {
  const targetPath = req.query.path as string;
  const full = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, targetPath);
  if (fs.existsSync(full) && fs.lstatSync(full).isDirectory()) {
    // Aqui seria usado archiver ou adm-zip
    res.status(501).json({ error: 'ZIP Engine requires server-side compression module. Logic ready.' });
  } else res.status(404).json({ error: 'Folder not found' });
});

// CRUD de Políticas de Pasta
app.post('/api/data/:slug/storage/policies', cascataAuth as any, async (req: any, res: any) => {
  const { folderPath, policy } = req.body;
  const project = req.project;
  const metadata = project.metadata || {};
  metadata.folder_policies = metadata.folder_policies || {};
  metadata.folder_policies[folderPath] = policy;
  
  await systemPool.query('UPDATE system.projects SET metadata = $1 WHERE slug = $2', [JSON.stringify(metadata), req.params.slug]);
  res.json({ success: true });
});

// Upload com Governança Unificada
app.post('/api/data/:slug/storage/:bucket/upload', cascataAuth as any, upload.single('file') as any, async (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const validation = validateGovernance(req, req.file.originalname, req.file.size);
  if (!validation.allowed) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: validation.error });
  }

  const targetPath = req.body.path || '';
  const dest = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, targetPath, req.file.originalname);
  if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
  
  fs.renameSync(req.file.path, dest);
  res.json({ success: true, name: req.file.originalname });
});

// Mover Objeto
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

// Deletar
app.delete('/api/data/:slug/storage/:bucket/object', cascataAuth as any, async (req: any, res: any) => {
  const target = req.query.path as string;
  const full = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, target);
  if (fs.existsSync(full)) {
    if (fs.lstatSync(full).isDirectory()) fs.rmSync(full, { recursive: true });
    else fs.unlinkSync(full);
    res.json({ success: true });
  } else res.status(404).json({ error: 'Not found' });
});

// Servir (Download/Visualização)
app.get('/api/data/:slug/storage/:bucket/object/:path(*)', cascataAuth as any, async (req: any, res: any) => {
  const full = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, req.params.path);
  if (fs.existsSync(full) && !fs.lstatSync(full).isDirectory()) {
    res.sendFile(full);
  } else res.status(404).json({ error: 'Not found' });
});

// --- DATA PLANE ROUTES ---

app.get('/api/data/:slug/policies', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'`);
  res.json(result.rows);
});

app.post('/api/data/:slug/policies', cascataAuth as any, async (req: any, res: any) => {
  const { name, table, command, role, using, withCheck } = req.body;
  const sql = `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY; CREATE POLICY "${name}" ON public."${table}" FOR ${command} TO ${role} USING (${using}) ${withCheck ? `WITH CHECK (${withCheck})` : ''};`;
  try { await req.projectPool.query(sql); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/data/:slug/policies/:table/:name', cascataAuth as any, async (req: any, res: any) => {
  try { await req.projectPool.query(`DROP POLICY "${req.params.name}" ON public."${req.params.table}"`); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
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

app.get('/api/data/:slug/ui-settings/:table', cascataAuth as any, async (req: any, res: any) => {
  const result = await systemPool.query('SELECT settings FROM system.ui_settings WHERE project_slug = $1 AND table_name = $2', [req.project.slug, req.params.table]);
  res.json(result.rows[0]?.settings || {});
});

app.post('/api/data/:slug/ui-settings/:table', cascataAuth as any, async (req: any, res: any) => {
  await systemPool.query('INSERT INTO system.ui_settings (project_slug, table_name, settings) VALUES ($1, $2, $3) ON CONFLICT (project_slug, table_name) DO UPDATE SET settings = $3', [req.project.slug, req.params.table, req.body.settings]);
  res.json({ success: true });
});

app.get('/api/data/:slug/assets', cascataAuth as any, async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.assets WHERE project_slug = $1 ORDER BY created_at ASC', [req.project.slug]);
  res.json(result.rows);
});

app.post('/api/data/:slug/assets', cascataAuth as any, async (req: any, res: any) => {
  const { id, name, type, parent_id, metadata } = req.body;
  if (id) {
    const result = await systemPool.query('UPDATE system.assets SET name = $1, metadata = $2 WHERE id = $3 RETURNING *', [name, metadata, id]);
    res.json(result.rows[0]);
  } else {
    const result = await systemPool.query('INSERT INTO system.assets (project_slug, name, type, parent_id, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *', [req.project.slug, name, type, parent_id, metadata]);
    res.json(result.rows[0]);
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

app.post('/api/data/:slug/query', cascataAuth as any, async (req: any, res: any) => {
  const { sql } = req.body;
  const start = Date.now();
  try { const result = await req.projectPool.query(sql); res.json({ ...result, duration: Date.now() - start }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/data/:slug/tables', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query("SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
  res.json(result.rows);
});

app.get('/api/data/:slug/tables/:table/columns', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT column_name as name, data_type as type, is_nullable = 'YES' as "isNullable", EXISTS (SELECT 1 FROM information_schema.key_column_usage kcu WHERE kcu.table_name = $1 AND kcu.column_name = c.column_name) as "isPrimaryKey" FROM information_schema.columns c WHERE table_name = $1`, [req.params.table]);
  res.json(result.rows);
});

app.get('/api/data/:slug/tables/:table/data', cascataAuth as any, async (req: any, res: any) => {
  try { const result = await req.projectPool.query(`SELECT * FROM public."${req.params.table}" LIMIT 1000`); res.json(result.rows); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/tables/:table/rows', cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.params;
  const { data } = req.body;
  const keys = Object.keys(data);
  const values = Object.values(data);
  const cols = keys.map(k => `"${k}"`).join(',');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
  try { await req.projectPool.query(`INSERT INTO public."${table}" (${cols}) VALUES (${placeholders})`, values); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.put('/api/data/:slug/tables/:table/rows', cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.params;
  const { data, pkColumn, pkValue } = req.body;
  const keys = Object.keys(data).filter(k => k !== pkColumn);
  const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
  const values = [...keys.map(k => data[k]), pkValue];
  try { await req.projectPool.query(`UPDATE public."${table}" SET ${setClause} WHERE "${pkColumn}" = $${values.length}`, values); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/tables/:table/delete-rows', cascataAuth as any, async (req: any, res: any) => {
  const { ids, pkColumn } = req.body;
  try { await req.projectPool.query(`DELETE FROM public."${req.params.table}" WHERE "${pkColumn}" = ANY($1)`, [ids]); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/data/:slug/functions', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT routine_name as name, routine_type as type FROM information_schema.routines WHERE routine_schema = 'public'`);
  res.json(result.rows);
});

app.get('/api/data/:slug/triggers', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT trigger_name as name, event_manipulation as event, event_object_table as table FROM information_schema.triggers WHERE trigger_schema = 'public'`);
  res.json(result.rows);
});

app.get('/api/data/:slug/auth/users', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query('SELECT id, email, created_at FROM auth.users');
  res.json(result.rows);
});

app.post('/api/data/:slug/auth/users', cascataAuth as any, async (req: any, res: any) => {
  const { email, password } = req.body;
  try { await req.projectPool.query('INSERT INTO auth.users (email, password_hash) VALUES ($1, $2)', [email, password]); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/data/:slug/stats', cascataAuth as any, async (req: any, res: any) => {
  const tables = await req.projectPool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
  const users = await req.projectPool.query("SELECT count(*) FROM auth.users").catch(() => ({ rows: [{ count: 0 }] }));
  const size = await req.projectPool.query("SELECT pg_size_pretty(pg_database_size(current_database()))");
  res.json({ tables: parseInt(tables.rows[0].count), users: parseInt(users.rows[0].count), size: size.rows[0].pg_size_pretty });
});

app.get('/api/data/:slug/logs', cascataAuth as any, async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.api_logs WHERE project_slug = $1 ORDER BY created_at DESC LIMIT 200', [req.project.slug]);
  res.json(result.rows);
});

app.listen(PORT, () => console.log(`[CASCATA MASTER ENGINE] v3.3 Governance-Aware Storage na porta ${PORT}`));