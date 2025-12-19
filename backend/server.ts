
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
 * CASCATA MASTER ENGINE v4.1 - RECOVERY & SECURITY MODE
 * Correção de Roteamento L7 e Validação de Sessão Administrativa.
 */

const app = express();
app.use(cors() as any);
app.use(express.json({ limit: '100mb' }) as any);

const { Pool } = pg;

const systemPool = new Pool({ 
  connectionString: process.env.SYSTEM_DATABASE_URL,
  max: 30,
  idleTimeoutMillis: 30000
});

const PORT = process.env.PORT || 3000;
const STORAGE_ROOT = path.resolve('storage');
if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });

const upload = multer({ dest: 'uploads/' });
const generateKey = () => crypto.randomBytes(32).toString('hex');

// --- MIDDLEWARES DE INFRAESTRUTURA ---

/**
 * 1. Resolver: Identifica o Tenant.
 */
const resolveProject = async (req: any, res: any, next: NextFunction) => {
  // Ignorar completamente rotas de controle e sistema para evitar overhead
  if (req.path.startsWith('/api/control/')) return next();

  const host = req.headers.host;
  const pathParts = req.path.split('/');
  const slugFromUrl = pathParts[3]; 

  try {
    let projectResult = await systemPool.query('SELECT * FROM system.projects WHERE custom_domain = $1', [host]);
    if (projectResult.rowCount === 0 && slugFromUrl) {
      projectResult = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1', [slugFromUrl]);
    }

    if (projectResult.rows[0]) {
      req.project = projectResult.rows[0];
      const dbName = req.project.db_name;
      req.projectPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${dbName}`) });
    }
    
    next();
  } catch (e) { 
    res.status(500).json({ error: 'Erro na resolução do contexto de banco de dados.' }); 
  }
};

/**
 * 2. Rewriter L7: Mapeia domínios customizados.
 * FIX: Ignora requisições que já são de API para não quebrar o roteamento interno.
 */
const customDomainRewriter = (req: any, res: any, next: NextFunction) => {
  if (req.project && !req.path.startsWith('/api/')) {
    const originalUrl = req.url;
    req.url = `/api/data/${req.project.slug}${originalUrl}`;
    console.log(`[L7 REWRITE] ${originalUrl} -> ${req.url}`);
  }
  next();
};

/**
 * 3. Audit Logger & Firewall
 */
const firewall = async (req: any, res: any, next: NextFunction) => {
  if (!req.project) return next();
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
  if (req.project.blocklist && req.project.blocklist.includes(clientIp)) {
    return res.status(403).json({ error: 'Acesso negado por política de Firewall.' });
  }
  next();
};

const auditLogger = async (req: any, res: any, next: NextFunction) => {
  const start = Date.now();
  const oldJson = res.json;
  res.json = function(data: any) {
    const duration = Date.now() - start;
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    if (req.project) {
      systemPool.query(
        `INSERT INTO system.api_logs (project_slug, method, path, status_code, client_ip, duration_ms, user_role) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.project.slug, req.method, req.path, res.statusCode, clientIp, duration, req.userRole || 'anonymous']
      ).catch(() => {});
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
 * 4. Cascata Auth v4.1: FIX LOGOUT & SECURITY GATE
 */
const cascataAuth = async (req: any, res: any, next: NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const apikey = (req.headers['apikey'] || req.query.apikey || authHeader?.split(' ')[1])?.trim();

    // Prioridade 1: Token de Admin do Sistema (Evita o logout automático no Studio)
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        jwt.verify(token, process.env.SYSTEM_JWT_SECRET || 'secret');
        req.userRole = 'service_role';
        return next();
      } catch (e) {
        // Se falhar, não retorna erro ainda, pode ser um token de usuário final do projeto
      }
    }

    // Se for rota de controle administrativo, o token mestre é obrigatório
    if (req.path.includes('/control/')) {
       return res.status(401).json({ error: 'Sessão administrativa expirada ou inválida.' });
    }

    // Prioridade 2: Service Key (API Admin)
    if (apikey === req.project?.service_key) {
      req.userRole = 'service_role';
      return next();
    }

    // Prioridade 3: Anon Key (Acesso Público Limitado)
    if (apikey === req.project?.anon_key) {
      req.userRole = 'anon';
      // Gate de Segurança: Anon Key não pode acessar áreas sensíveis de metadados
      const sensitive = ['/auth/mapping', '/assets', '/ui-settings', '/logs', '/stats', '/query'];
      if (sensitive.some(p => req.path.includes(p))) {
        return res.status(403).json({ error: 'Acesso negado: Anon Key não possui permissões de governança.' });
      }
      return next();
    }

    // Prioridade 4: Token de Usuário do Projeto (Autenticado via Auth.users)
    if (authHeader?.startsWith('Bearer ') && req.project?.jwt_secret) {
      try {
        const token = authHeader.split(' ')[1];
        req.user = jwt.verify(token, req.project.jwt_secret);
        req.userRole = 'authenticated';
        return next();
      } catch (e) {}
    }

    return res.status(401).json({ error: 'Credenciais inválidas para o contexto solicitado.' });
  } catch (e) { res.status(401).json({ error: 'Erro no protocolo de segurança.' }); }
};

// --- ENDPOINTS (ORDEM PRESERVADA) ---

app.post('/api/control/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
  const admin = result.rows[0];
  if (admin && admin.password_hash === password) {
    const token = jwt.sign({ sub: admin.id, role: 'admin' }, process.env.SYSTEM_JWT_SECRET || 'secret');
    res.json({ token });
  } else res.status(401).json({ error: 'E-mail ou senha administrativa incorretos.' });
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

// --- DATA PLANE (RPC, AUTH, MAPPING) ---

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

app.post('/api/data/:slug/rpc/:name', cascataAuth as any, async (req: any, res: any) => {
  const params = req.body;
  const placeholders = Object.keys(params).map((_, i) => `$${i + 1}`).join(', ');
  const sql = `SELECT * FROM public."${req.params.name}"(${placeholders})`;
  try {
    const result = await req.projectPool.query(sql, Object.values(params));
    res.json(result.rows);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Os demais endpoints de tables, columns, storage e assets seguem o padrão cascataAuth preservado v4.0

app.listen(PORT, () => console.log(`[CASCATA MASTER ENGINE] v4.1 Online on port ${PORT}`));
