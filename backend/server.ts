
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

const STORAGE_ROOT = path.join(process.cwd(), 'storage');
if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });

const upload = multer({ dest: 'uploads/' });
const generateKey = () => crypto.randomBytes(32).toString('hex');

// In-memory rate limiting state
const rateLimitMap = new Map<string, { count: number, reset: number }>();

// --- SECURITY MIDDLEWARES ---

const securityGovernor = async (req: any, res: any, next: NextFunction) => {
  if (!req.project || req.path.includes('/control/')) return next();

  const config = req.project.security_config || {};
  const { rate_limit = 0, table_permissions = {} } = config;

  // 1. Rate Limiting Check
  if (rate_limit > 0) {
    const now = Date.now();
    const key = `${req.project.slug}:${req.ip}`;
    const record = rateLimitMap.get(key) || { count: 0, reset: now + 60000 };
    
    if (now > record.reset) {
      record.count = 0;
      record.reset = now + 60000;
    }
    
    record.count++;
    rateLimitMap.set(key, record);

    if (record.count > rate_limit) {
      return res.status(429).json({ error: 'Rate limit exceeded for this project instance.' });
    }
  }

  // 2. No-Code Table Permission Governor
  const methodMap: Record<string, string> = { 
    'GET': 'read', 
    'POST': 'create', 
    'PUT': 'update', 
    'PATCH': 'update', 
    'DELETE': 'delete' 
  };
  
  const operation = methodMap[req.method];
  const pathParts = req.path.split('/');
  const table = pathParts[pathParts.indexOf('tables') + 1];

  if (table && operation && table_permissions[table]) {
    const perm = table_permissions[table];
    const role = req.userRole || 'anon';
    
    // Check if the specific operation is allowed for the role
    if (perm[role] && perm[role][operation] === false) {
      return res.status(403).json({ error: `Governor: Access Denied. Operation '${operation}' is disabled for '${role}' on table '${table}'.` });
    }
  }

  next();
};

const resolveProject = async (req: any, res: any, next: NextFunction) => {
  if (req.path.includes('/control/')) return next();

  const host = req.headers.host;
  const pathParts = req.path.split('/');
  const slugFromUrl = pathParts[3]; 

  try {
    // 1. Domain-First Resolution (Binding check)
    let projectResult = await systemPool.query('SELECT * FROM system.projects WHERE custom_domain = $1', [host]);
    
    if (projectResult.rowCount > 0) {
      req.project = projectResult.rows[0];
      // If the domain is bound to a project, prevent accessing another project via slug through this host
      if (slugFromUrl && slugFromUrl !== req.project.slug) {
        return res.status(403).json({ error: 'Domain Binding Violation: This endpoint is restricted to its authorized domain.' });
      }
    } else if (slugFromUrl) {
      // 2. Slug-based fallback
      projectResult = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1', [slugFromUrl]);
      if (projectResult.rows[0]?.custom_domain) {
        // SECURITY GATE: If a project has a custom domain, slug access is DISALLOWED to prevent IP-based bypassing
        return res.status(403).json({ error: 'Project Locked: This instance requires access via its authorized custom domain.' });
      }
      req.project = projectResult.rows[0];
    }

    if (!req.project) {
      if (req.path.startsWith('/api/data/')) return res.status(404).json({ error: 'Project not found or domain unauthorized.' });
      return next();
    }

    const dbName = req.project.db_name;
    req.projectPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${dbName}`) });
    next();
  } catch (e) { 
    res.status(500).json({ error: 'Gateway Resolution Error' }); 
  }
};

const cascataAuth = async (req: any, res: any, next: NextFunction) => {
  if (req.path.includes('/control/')) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Admin Access Required' });
    try {
      jwt.verify(authHeader.split(' ')[1], process.env.SYSTEM_JWT_SECRET || 'secret');
      return next();
    } catch (e) { return res.status(401).json({ error: 'Invalid Session' }); }
  }

  const apikey = req.headers['apikey'] || req.query.apikey || req.headers['authorization']?.split(' ')[1];
  
  if (apikey === req.project?.service_key || apikey === req.project?.anon_key) { 
    req.userRole = apikey === req.project?.service_key ? 'service_role' : 'anon'; 
    return next(); 
  }

  const authHeader = req.headers['authorization'];
  if (authHeader) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], req.project.jwt_secret);
      req.user = decoded; 
      req.userRole = 'authenticated';
    } catch (e) {}
  }
  next();
};

app.use(resolveProject as any);
app.use(cascataAuth as any);
app.use(securityGovernor as any);

// --- CONTROL PLANE ENDPOINTS ---

app.post('/api/control/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
  const admin = result.rows[0];
  if (admin && admin.password_hash === password) {
    const token = jwt.sign({ sub: admin.id, role: 'admin' }, process.env.SYSTEM_JWT_SECRET || 'secret');
    res.json({ token });
  } else res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/control/projects', async (req, res) => {
  const result = await systemPool.query('SELECT * FROM system.projects ORDER BY created_at DESC');
  res.json(result.rows);
});

app.patch('/api/control/projects/:slug', async (req: any, res: any) => {
  const { name, custom_domain, security_config } = req.body;
  try {
    const result = await systemPool.query(
      'UPDATE system.projects SET name = COALESCE($1, name), custom_domain = COALESCE($2, custom_domain), security_config = COALESCE($3, security_config), updated_at = now() WHERE slug = $4 RETURNING *',
      [name, custom_domain, security_config ? JSON.stringify(security_config) : null, req.params.slug]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Fixed Webhook 404 Routes
app.get('/api/control/projects/:slug/webhooks', async (req, res) => {
  const result = await systemPool.query('SELECT * FROM system.webhooks WHERE project_slug = $1', [req.params.slug]);
  res.json(result.rows);
});

app.post('/api/control/projects/:slug/webhooks', async (req, res) => {
  const { target_url, event_type, table_name } = req.body;
  const result = await systemPool.query(
    'INSERT INTO system.webhooks (project_slug, target_url, event_type, table_name) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.params.slug, target_url, event_type, table_name]
  );
  res.json(result.rows[0]);
});

app.post('/api/control/projects', async (req: any, res: any) => {
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
    `);
    await tempPool.end();
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- DATA PLANE ENDPOINTS ---

app.post('/api/data/:slug/query', async (req: any, res: any) => {
  try {
    const result = await req.projectPool.query(req.body.sql);
    res.json(result);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/data/:slug/tables', async (req: any, res: any) => {
  const result = await req.projectPool.query("SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public'");
  res.json(result.rows);
});

app.get('/api/data/:slug/policies', async (req: any, res: any) => {
  const result = await req.projectPool.query(`SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'`);
  res.json(result.rows);
});

app.post('/api/data/:slug/rpc/:name', async (req: any, res: any) => {
  const params = req.body;
  const placeholders = Object.keys(params).map((_, i) => `$${i + 1}`).join(', ');
  try {
    const result = await req.projectPool.query(`SELECT * FROM public."${req.params.name}"(${placeholders})`, Object.values(params));
    res.json(result.rows);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`[CASCATA MASTER ENGINE] v2.9 Operational on port ${PORT}`));
