
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
 * CASCATA CORE ENGINE v1.2
 * Plataforma de Infraestrutura BaaS Independente
 * Foco: Isolamento Físico, Performance SQL e Vínculos Fortes para RLS.
 */

const app = express();
app.use(cors() as any);
app.use(express.json({ limit: '100mb' }) as any);

const { Pool } = pg;

// Pool do Sistema - Gerencia Projetos, Logs Globais e Metadados de Governança
const systemPool = new Pool({ 
  connectionString: process.env.SYSTEM_DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const PORT = process.env.PORT || 3000;

// Configuração de Storage Nativo
const STORAGE_ROOT = path.resolve('storage');
if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });

// Setup de Upload (Multer) para Ingestão de Dados e Assets
const upload = multer({ dest: 'uploads/' });
const generateKey = () => crypto.randomBytes(32).toString('hex');

// --- MIDDLEWARES DE INFRAESTRUTURA E SEGURANÇA ---

/**
 * Firewall de IP: Bloqueia requisições de origens na blocklist do projeto.
 */
const firewall = async (req: any, res: any, next: NextFunction) => {
  if (!req.project) return next();
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (req.project.blocklist && req.project.blocklist.includes(clientIp)) {
    return res.status(403).json({ error: 'Access denied by security policy (IP Blocked)' });
  }
  next();
};

/**
 * Audit Logger: Telemetria profunda de tráfego. 
 * Captura performance, payloads, roles e informações geográficas/internas.
 */
const auditLogger = async (req: any, res: any, next: NextFunction) => {
  const start = Date.now();
  const oldJson = res.json;

  res.json = function(data: any) {
    const duration = Date.now() - start;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const isInternal = req.headers.referer?.includes(req.headers.host || '') || false;

    if (req.project) {
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
      ).catch(e => console.error('[Telemetry Failure]', e));
    }
    return oldJson.apply(res, arguments as any);
  };
  next();
};

/**
 * Project Resolver: Detecta o contexto do projeto via subdomínio (custom_domain) ou slug na URL.
 * Inicializa dinamicamente o pool de conexão para a base física do tenant.
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
      if (req.path.startsWith('/api/data/')) return res.status(404).json({ error: 'Project context not found.' });
      return next();
    }

    req.project = projectResult.rows[0];
    const dbName = req.project.db_name;
    // Pool secundário apontando para o banco de dados isolado do projeto
    req.projectPool = new Pool({ 
      connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${dbName}`) 
    });
    next();
  } catch (e) { 
    console.error('[Critical Resolver Error]', e);
    res.status(500).json({ error: 'Internal Database Routing Failure' }); 
  }
};

app.use(resolveProject as any);
app.use(firewall as any);
app.use(auditLogger as any);

/**
 * Middleware de Autenticação em Cascata:
 * 1. Admin/Control Plane (JWT Master)
 * 2. Service Role (Full Access via Secret Key)
 * 3. Anon Role (Limited Access via Anon Key)
 * 4. Authenticated Role (User JWT validate contra o secret do projeto)
 */
const cascataAuth = async (req: any, res: any, next: NextFunction) => {
  try {
    // Caso de controle administrativo (Studio)
    if (req.path.includes('/control/')) {
      const authHeader = req.headers['authorization'];
      if (!authHeader) return res.status(401).json({ error: 'Administrative Session Required' });
      const masterToken = authHeader.split(' ')[1];
      jwt.verify(masterToken, process.env.SYSTEM_JWT_SECRET || 'secret');
      return next();
    }

    // Caso de Data Plane (API do Projeto)
    const apikeyRaw = req.headers['apikey'] || req.query.apikey;
    const authHeader = req.headers['authorization'];
    const bearerToken = (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null)?.trim();
    const queryToken = req.query.token;
    const apikey = (apikeyRaw || bearerToken || queryToken)?.trim();

    // Verificação de Service Role (Admin do Projeto)
    if (bearerToken || queryToken) {
      try {
        jwt.verify((bearerToken || queryToken), process.env.SYSTEM_JWT_SECRET || 'secret');
        req.userRole = 'service_role';
        return next();
      } catch (e) {}
    }

    if (apikey === req.project?.service_key) {
      req.userRole = 'service_role';
      return next();
    }

    // Verificação de Anon Key
    if (apikey === req.project?.anon_key) {
      req.userRole = 'anon';
    }

    // Verificação de JWT de Usuário Final (Authenticated)
    if ((bearerToken || queryToken) && req.project?.jwt_secret) {
      try {
        const decoded = jwt.verify((bearerToken || queryToken), req.project.jwt_secret);
        req.user = decoded; 
        req.userRole = 'authenticated';
        return next();
      } catch (e) {}
    }

    if (!req.userRole) {
      return res.status(401).json({ 
        error: 'Access Denied: Invalid API Key or Session for this context.' 
      });
    }

    next();
  } catch (e) {
    res.status(401).json({ error: 'Authentication engine failure' });
  }
};

// --- CONTROL PLANE: GESTÃO DE INFRAESTRUTURA ---

app.get('/api/control/me/ip', (req: any, res: any) => {
  const ip = req.headers['x-forwarded-for'] || (req as any).socket?.remoteAddress;
  res.json({ ip });
});

app.post('/api/control/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
  const admin = result.rows[0];
  if (admin && admin.password_hash === password) {
    const token = jwt.sign({ sub: admin.id, role: 'admin' }, process.env.SYSTEM_JWT_SECRET || 'secret');
    res.json({ token });
  } else res.status(401).json({ error: 'Invalid root credentials' });
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
    
    // Provisionamento inicial do schema do projeto
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

app.patch('/api/control/projects/:slug', cascataAuth as any, async (req: any, res: any) => {
  const { name, custom_domain, metadata } = req.body;
  try {
    const result = await systemPool.query(
      'UPDATE system.projects SET name = COALESCE($1, name), custom_domain = COALESCE($2, custom_domain), metadata = COALESCE($3, metadata), updated_at = now() WHERE slug = $4 RETURNING *',
      [name, custom_domain, metadata ? JSON.stringify(metadata) : null, req.params.slug]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/control/projects/:slug/block-ip', cascataAuth as any, async (req, res) => {
  const { ip } = req.body;
  await systemPool.query(
    'UPDATE system.projects SET blocklist = array_append(blocklist, $1) WHERE slug = $2 AND NOT ($1 = ANY(blocklist))',
    [ip, req.params.slug]
  );
  res.json({ success: true });
});

app.delete('/api/control/projects/:slug/logs', cascataAuth as any, async (req, res) => {
  const { days } = req.query;
  await systemPool.query(
    'DELETE FROM system.api_logs WHERE project_slug = $1 AND created_at < now() - $2::interval',
    [req.params.slug, `${days} days`]
  );
  res.json({ success: true });
});

// --- AUTH ENGINE & VÍNCULO FORTE (CORAÇÃO DO SISTEMA) ---

/**
 * Listagem de usuários com Paginação Poderosa e Filtro por Tabela de Vínculo.
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Criação Atômica de Usuário:
 * Garante que o UUID gerado no `auth.users` seja o MESMO usado na row da tabela pública selecionada.
 * Isso permite políticas RLS nativas: `USING (auth.uid() = id)`.
 */
app.post('/api/data/:slug/auth/users', cascataAuth as any, async (req: any, res: any) => {
  const { email, password, target_table } = req.body;
  const client = await req.projectPool.connect();
  
  try {
    await client.query('BEGIN'); // Transação Atômica

    // 1. Inserir no Schema de Auth
    const userRes = await client.query(
      'INSERT INTO auth.users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email, password]
    );
    const userId = userRes.rows[0].id;

    // 2. Criar row automática na tabela pública vinculada
    const mapping = req.project.metadata?.user_table_mapping;
    const tableToLink = target_table || mapping?.principal_table;

    if (tableToLink) {
      await client.query(
        `INSERT INTO public."${tableToLink}" (id, email) VALUES ($1, $2)`, 
        [userId, email]
      );
    }

    await client.query('COMMIT');
    res.json({ id: userId, email, success: true });
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error('[User Mapping Failure]', e);
    res.status(400).json({ error: `Erro crítico no vínculo: ${e.message}` });
  } finally {
    client.release();
  }
});

/**
 * Salva metadados de mapeamento de usuários.
 * CORREÇÃO DO ERRO 500/502: Realiza merge seguro de metadados JSON.
 */
app.post('/api/data/:slug/auth/mapping', cascataAuth as any, async (req: any, res: any) => {
  try {
    const { principal_table, additional_tables } = req.body;
    
    // Busca metadados atuais para merge
    const projRes = await systemPool.query('SELECT metadata FROM system.projects WHERE slug = $1', [req.params.slug]);
    const currentMetadata = projRes.rows[0]?.metadata || {};
    
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
    console.error('[Mapping Config Error]', e);
    res.status(500).json({ error: 'Falha ao salvar configuração de mapeamento.' });
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

// --- DATA BROWSER & SQL ENGINE ---

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

app.post('/api/data/:slug/tables/:table/rows', cascataAuth as any, async (req: any, res: any) => {
  const { data } = req.body;
  const keys = Object.keys(data);
  const values = Object.values(data);
  const cols = keys.map(k => `"${k}"`).join(',');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
  try {
    await req.projectPool.query(`INSERT INTO public."${req.params.table}" (${cols}) VALUES (${placeholders})`, values);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/query', cascataAuth as any, async (req: any, res: any) => {
  const { sql } = req.body;
  const start = Date.now();
  try {
    const result = await req.projectPool.query(sql);
    res.json({ ...result, duration: Date.now() - start });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- RLS POLICY ENGINE ---

app.get('/api/data/:slug/policies', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'`);
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

// --- STORAGE & GOVERNANCE ENGINE ---

const validateGovernance = (req: any, fileName: string, fileSize: number) => {
  const governance = req.project.metadata?.storage_governance;
  if (!governance) return { allowed: true };

  const ext = path.extname(fileName).toLowerCase().replace('.', '');
  let policy = governance.global || { max_size: '100MB', allowed_exts: [] };
  
  for (const [sectorId, config] of Object.entries(governance) as any) {
    if (sectorId !== 'global' && config.allowed_exts?.includes(ext)) {
      policy = config;
      break;
    }
  }

  const parseSize = (s: string) => {
    const num = parseFloat(s);
    if (s.includes('TB')) return num * 1024 * 1024 * 1024 * 1024;
    if (s.includes('GB')) return num * 1024 * 1024 * 1024;
    if (s.includes('MB')) return num * 1024 * 1024;
    if (s.includes('KB')) return num * 1024;
    return num;
  };

  if (fileSize > parseSize(policy.max_size)) return { allowed: false, error: `Limite excedido: máx ${policy.max_size}` };
  return { allowed: true };
};

app.get('/api/data/:slug/storage/buckets', cascataAuth as any, async (req: any, res: any) => {
  const p = path.join(STORAGE_ROOT, req.project.slug);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  const items = fs.readdirSync(p).filter(f => fs.lstatSync(path.join(p, f)).isDirectory());
  res.json(items.map(name => ({ name })));
});

app.post('/api/data/:slug/storage/:bucket/upload', cascataAuth as any, upload.single('file') as any, async (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const validation = validateGovernance(req, req.file.originalname, req.file.size);
  if (!validation.allowed) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: validation.error }); }

  const targetPath = req.body.path || '';
  const dest = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, targetPath, req.file.originalname);
  if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(req.file.path, dest);
  res.json({ success: true });
});

app.get('/api/data/:slug/storage/:bucket/list', cascataAuth as any, async (req: any, res: any) => {
  const subPath = req.query.path || '';
  const p = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, subPath as string);
  if (!fs.existsSync(p)) return res.json({ items: [] });
  const items = fs.readdirSync(p).map(name => {
    const full = path.join(p, name);
    const stat = fs.statSync(full);
    return { name, type: stat.isDirectory() ? 'folder' : 'file', size: stat.size, updated_at: stat.mtime, path: path.join(subPath as string, name) };
  });
  res.json({ items });
});

// --- TELEMETRIA & MONITORAMENTO ---

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

// --- ASSETS & LÓGICA DE NEGÓCIO ---

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

app.listen(PORT, () => console.log(`[CASCATA IDENTITY ENGINE] v1.2 Online on ${PORT}`));
