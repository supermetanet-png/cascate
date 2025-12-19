
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
 * CASCATA MASTER ENGINE v4.0 - ENTERPRISE GRADE
 * Arquitetura de Isolamento Físico, Governança de Storage e Roteamento de Camada 7.
 */

const app = express();
app.use(cors() as any);
app.use(express.json({ limit: '100mb' }) as any);

const { Pool } = pg;

// Pool de Governança do Sistema
const systemPool = new Pool({ 
  connectionString: process.env.SYSTEM_DATABASE_URL,
  max: 30,
  idleTimeoutMillis: 30000
});

const PORT = process.env.PORT || 3000;

// Root do Storage persistente
const STORAGE_ROOT = path.resolve('storage');
if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });

const upload = multer({ dest: 'uploads/' });
const generateKey = () => crypto.randomBytes(32).toString('hex');

// --- MIDDLEWARES DE INFRAESTRUTURA (PIPELINE DE SEGURANÇA) ---

/**
 * 1. Resolver: Identifica o Tenant via Host ou Slug.
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
      if (req.path.startsWith('/api/data/')) return res.status(404).json({ error: 'Contexto de infraestrutura não encontrado.' });
      return next();
    }

    req.project = projectResult.rows[0];
    const dbName = req.project.db_name;
    req.projectPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${dbName}`) });
    next();
  } catch (e) { 
    res.status(500).json({ error: 'Falha crítica na resolução do banco de dados.' }); 
  }
};

/**
 * 2. Rewriter: Mapeia rotas de domínios customizados para o pipeline do Data Plane.
 * Corrige o erro 405/404 em domínios tipo api.site.com/rpc/name
 */
const customDomainRewriter = (req: any, res: any, next: NextFunction) => {
  if (req.project && !req.path.startsWith('/api/data/') && !req.path.startsWith('/api/control/')) {
    const originalUrl = req.url;
    req.url = `/api/data/${req.project.slug}${originalUrl}`;
    console.log(`[L7 Rewrite] ${originalUrl} -> ${req.url}`);
  }
  next();
};

/**
 * 3. Firewall: Bloqueio de IP Geográfico/Manual.
 */
const firewall = async (req: any, res: any, next: NextFunction) => {
  if (!req.project) return next();
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
  if (req.project.blocklist && req.project.blocklist.includes(clientIp)) {
    return res.status(403).json({ error: 'Acesso negado: IP bloqueado por política de segurança.' });
  }
  next();
};

/**
 * 4. Audit Logger: Telemetria e Logs para API Traffic.
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

app.use(resolveProject as any);
app.use(customDomainRewriter as any);
app.use(firewall as any);
app.use(auditLogger as any);

/**
 * 5. Cascata Auth v4: Blindagem Zero-Trust.
 * Bloqueia uso de chaves cruzadas e garante que anon_key só acesse o Data Plane do projeto dono.
 */
const cascataAuth = async (req: any, res: any, next: NextFunction) => {
  try {
    // Acesso ao Plano de Controle (Studio Root)
    if (req.path.includes('/control/')) {
      const authHeader = req.headers['authorization'];
      if (!authHeader) return res.status(401).json({ error: 'Sessão administrativa necessária.' });
      jwt.verify(authHeader.split(' ')[1], process.env.SYSTEM_JWT_SECRET || 'secret');
      return next();
    }

    const apikey = (req.headers['apikey'] || req.query.apikey || req.headers['authorization']?.split(' ')[1])?.trim();
    const authHeader = req.headers['authorization'];

    // VULNERABILITY FIX: Validar se a chave pertence AO PROJETO RESOLVIDO
    if (apikey === req.project?.service_key) { 
      req.userRole = 'service_role'; 
      return next(); 
    }
    
    if (apikey === req.project?.anon_key) { 
      req.userRole = 'anon'; 
      // Não retorna next() aqui se for rota sensível de metadados
    }

    // Acesso via Studio (Master Token)
    if (authHeader?.startsWith('Bearer ') && !req.project?.jwt_secret) {
      try {
        jwt.verify(authHeader.split(' ')[1], process.env.SYSTEM_JWT_SECRET || 'secret');
        req.userRole = 'service_role';
        return next();
      } catch (e) {}
    }

    // Acesso Autenticado de Usuário do Projeto
    if (authHeader?.startsWith('Bearer ') && req.project?.jwt_secret) {
      try {
        req.user = jwt.verify(authHeader.split(' ')[1], req.project.jwt_secret);
        req.userRole = 'authenticated';
        return next();
      } catch (e) {}
    }

    if (!req.userRole) return res.status(401).json({ error: 'Credenciais inválidas para este escopo de projeto.' });
    
    // SECURITY GATE: Impedir anon_key de acessar endpoints de metadados do sistema (mapping, assets, etc)
    const sensitivePaths = ['/auth/mapping', '/assets', '/ui-settings', '/logs', '/stats'];
    if (req.userRole === 'anon' && sensitivePaths.some(p => req.path.includes(p))) {
      return res.status(403).json({ error: 'Acesso proibido: Anon Key não possui privilégios de metadados.' });
    }

    next();
  } catch (e) { res.status(401).json({ error: 'Erro no protocolo de autenticação.' }); }
};

// --- API CONTROL PLANE (STUDIO ADMIN) ---

app.post('/api/control/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
  const admin = result.rows[0];
  if (admin && admin.password_hash === password) {
    const token = jwt.sign({ sub: admin.id, role: 'admin' }, process.env.SYSTEM_JWT_SECRET || 'secret');
    res.json({ token });
  } else res.status(401).json({ error: 'Credenciais administrativas inválidas.' });
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

// --- API DATA PLANE: AUTH & IDENTITY ---

app.get('/api/data/:slug/auth/users', cascataAuth as any, async (req: any, res: any) => {
  try {
    const limit = req.query.limit === 'all' ? 1000000 : parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const filterTable = req.query.table || null;

    let query = 'SELECT id, email, created_at FROM auth.users WHERE email LIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3';
    if (filterTable) {
      query = `SELECT u.id, u.email, u.created_at FROM auth.users u JOIN public."${filterTable}" p ON u.id = p.id WHERE u.email LIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    }
    const result = await req.projectPool.query(query, [search, limit, offset]);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/data/:slug/auth/users', cascataAuth as any, async (req: any, res: any) => {
  const { email, password, target_table } = req.body;
  const client = await req.projectPool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query('INSERT INTO auth.users (email, password_hash) VALUES ($1, $2) RETURNING id', [email, password]);
    const userId = userRes.rows[0].id;
    const tableToLink = target_table || req.project.metadata?.user_table_mapping?.principal_table;
    if (tableToLink) await client.query(`INSERT INTO public."${tableToLink}" (id, email) VALUES ($1, $2)`, [userId, email]);
    await client.query('COMMIT');
    res.json({ id: userId, success: true });
  } catch (e: any) { await client.query('ROLLBACK'); res.status(400).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/api/data/:slug/auth/mapping', cascataAuth as any, async (req: any, res: any) => {
  try {
    const { principal_table, additional_tables } = req.body;
    const projRes = await systemPool.query('SELECT metadata FROM system.projects WHERE slug = $1', [req.params.slug]);
    const metadata = projRes.rows[0].metadata || {};
    metadata.user_table_mapping = { principal_table, additional_tables };
    await systemPool.query('UPDATE system.projects SET metadata = $1 WHERE slug = $2', [JSON.stringify(metadata), req.params.slug]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Falha interna ao salvar mapeamento.' }); }
});

// --- API DATA PLANE: DATABASE EXPLORER ---

app.get('/api/data/:slug/tables', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query("SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
  res.json(result.rows);
});

app.get('/api/data/:slug/tables/:table/columns', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(
    `SELECT column_name as name, data_type as type, is_nullable = 'YES' as "isNullable", EXISTS (SELECT 1 FROM information_schema.key_column_usage WHERE table_name = $1 AND column_name = c.column_name) as "isPrimaryKey" FROM information_schema.columns c WHERE table_name = $1`, [req.params.table]
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
  const cols = Object.keys(data).map(k => `"${k}"`).join(',');
  const placeholders = Object.keys(data).map((_, i) => `$${i + 1}`).join(',');
  try {
    await req.projectPool.query(`INSERT INTO public."${req.params.table}" (${cols}) VALUES (${placeholders})`, Object.values(data));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/query', cascataAuth as any, async (req: any, res: any) => {
  const start = Date.now();
  try {
    const result = await req.projectPool.query(req.body.sql);
    res.json({ ...result, duration: Date.now() - start });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/api/data/:slug/rpc/:name', cascataAuth as any, async (req: any, res: any) => {
  const params = req.body;
  const placeholders = Object.keys(params).map((_, i) => `$${i + 1}`).join(', ');
  const sql = `SELECT * FROM public."${req.params.name}"(${placeholders})`;
  try {
    const result = await req.projectPool.query(sql, Object.values(params));
    res.json(result.rows);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// --- API DATA PLANE: RLS POLICIES ---

app.get('/api/data/:slug/policies', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT policyname, tablename, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'`);
  res.json(result.rows);
});

app.post('/api/data/:slug/policies', cascataAuth as any, async (req: any, res: any) => {
  const { name, table, command, role, using, withCheck } = req.body;
  const sql = `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY; CREATE POLICY "${name}" ON public."${table}" FOR ${command} TO ${role} USING (${using}) ${withCheck ? `WITH CHECK (${withCheck})` : ''};`;
  await req.projectPool.query(sql);
  res.json({ success: true });
});

// --- API DATA PLANE: STORAGE (MOTOR DE GOVERNANÇA) ---

app.get('/api/data/:slug/storage/buckets', cascataAuth as any, async (req: any, res: any) => {
  const p = path.join(STORAGE_ROOT, req.project.slug);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  res.json(fs.readdirSync(p).filter(f => fs.lstatSync(path.join(p, f)).isDirectory()).map(name => ({ name })));
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

app.post('/api/data/:slug/storage/:bucket/upload', cascataAuth as any, upload.single('file') as any, async (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ error: 'Payload de arquivo vazio.' });
  const dest = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, req.body.path || '', req.file.originalname);
  if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(req.file.path, dest);
  res.json({ success: true });
});

app.post('/api/data/:slug/storage/:bucket/duplicate', cascataAuth as any, async (req: any, res: any) => {
  const { targetPath } = req.body;
  const source = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, targetPath);
  const ext = path.extname(targetPath);
  const base = targetPath.replace(ext, '');
  const dest = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, `${base}_copy_${Date.now()}${ext}`);
  fs.copyFileSync(source, dest);
  res.json({ success: true });
});

// --- API DATA PLANE: ASSETS, LOGS & TELEMETRY ---

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

app.get('/api/data/:slug/logs', cascataAuth as any, async (req: any, res: any) => {
  const result = await systemPool.query('SELECT * FROM system.api_logs WHERE project_slug = $1 ORDER BY created_at DESC LIMIT 200', [req.params.slug]);
  res.json(result.rows);
});

app.get('/api/data/:slug/stats', cascataAuth as any, async (req: any, res: any) => {
  try {
    const tables = await req.projectPool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
    const users = await req.projectPool.query("SELECT count(*) FROM auth.users").catch(() => ({ rows: [{ count: 0 }] }));
    const size = await req.projectPool.query("SELECT pg_size_pretty(pg_database_size(current_database()))");
    res.json({ tables: parseInt(tables.rows[0].count), users: parseInt(users.rows[0].count), size: size.rows[0].pg_size_pretty });
  } catch (e) { res.json({ tables: 0, users: 0, size: '0 MB' }); }
});

app.get('/api/data/:slug/ui-settings/:table', cascataAuth as any, async (req: any, res: any) => {
  const r = await systemPool.query('SELECT settings FROM system.ui_settings WHERE project_slug = $1 AND table_name = $2', [req.params.slug, req.params.table]);
  res.json(r.rows[0]?.settings || {});
});

app.post('/api/data/:slug/ui-settings/:table', cascataAuth as any, async (req: any, res: any) => {
  await systemPool.query('INSERT INTO system.ui_settings (project_slug, table_name, settings) VALUES ($1, $2, $3) ON CONFLICT (project_slug, table_name) DO UPDATE SET settings = $3', [req.params.slug, req.params.table, JSON.stringify(req.body.settings)]);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`[CASCATA MASTER ENGINE] v4.0 Online na porta ${PORT}`));
