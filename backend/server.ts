
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

const upload = multer({ dest: 'uploads/' });

const { Pool } = pg;
const systemPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL });

const PORT = process.env.PORT || 3000;

// Helper para gerar chaves seguras
const generateKey = () => crypto.randomBytes(32).toString('hex');

// Middleware: Auditoria Real
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

// Middleware: Resolução de Projeto e Conexão Dinâmica
const resolveProject = async (req: any, res: any, next: NextFunction) => {
  const slug = req.params.slug || req.headers['x-project-id'] || req.path.split('/')[3];
  if (!slug || req.path.includes('/control/')) return next();
  
  try {
    const result = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1', [slug]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Project not found' });
    req.project = result.rows[0];
    
    // Pool dinâmico para o banco do projeto
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
  const apikey = req.headers['apikey'] || req.query.apikey;
  if (!apikey) return res.status(401).json({ error: 'API Key is required' });

  if (apikey === req.project?.service_key) { 
    req.userRole = 'service_role'; 
    return next(); 
  }
  if (apikey === req.project?.anon_key) { 
    req.userRole = 'anon'; 
    // Aqui poderíamos validar o JWT se presente para definir roles de RLS
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

// --- CONTROL PLANE: Provisionamento ---
// FIX: Changed 'res: Response' to 'res: any' to avoid conflict with the global Node.js/DOM Response type
app.post('/api/control/projects', async (req: any, res: any) => {
  const { name, slug } = req.body;
  const db_name = `cascata_db_${slug.replace(/-/g, '_')}`;
  
  try {
    // 1. Criar banco físico
    await systemPool.query(`CREATE DATABASE ${db_name}`);
    
    // 2. Gerar segredos
    const anon_key = generateKey();
    const service_key = generateKey();
    const jwt_secret = generateKey();

    // 3. Registrar no sistema
    const result = await systemPool.query(
      `INSERT INTO system.projects (name, slug, db_name, anon_key, service_key, jwt_secret) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, slug, db_name, anon_key, service_key, jwt_secret]
    );

    res.json(result.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- DATA PLANE: CRUD Genérico ---
app.get('/api/data/:slug/tables/:table/data', resolveProject as any, cascataAuth as any, auditLogger as any, async (req: any, res: any) => {
  const { table } = req.params;
  const client = await req.projectPool.connect();
  try {
    // Implementação real de SELECT com suporte a RLS via session variable
    if (req.user) await client.query(`SET LOCAL auth.uid = '${req.user.sub}'`);
    
    const result = await client.query(`SELECT * FROM public.${table} LIMIT 100`);
    res.json(result.rows);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.post('/api/data/:slug/tables/:table/rows', resolveProject as any, cascataAuth as any, auditLogger as any, async (req: any, res: any) => {
  const { table } = req.params;
  const { data } = req.body;
  
  const columns = Object.keys(data).join(', ');
  const values = Object.values(data);
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  try {
    const result = await req.projectPool.query(
      `INSERT INTO public.${table} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    res.status(201).json(result.rows[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- WEBHOOKS & REALTIME (Mantidos e Refinados) ---
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

app.listen(PORT, () => console.log(`[CASCATA ENGINE] FULLY OPERATIONAL ON PORT ${PORT}`));
