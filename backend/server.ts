
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

const projectPools: Record<string, pg.Pool> = {};
const PORT = process.env.PORT || 3000;

/**
 * MONITORING MIDDLEWARE: Registra cada chamada de API para o dashboard
 */
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
  const slug = req.path.split('/')[3] || req.headers['x-project-id'];
  if (req.path.includes('/control/')) return next();
  
  const result = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1 OR id::text = $1', [slug]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Project not found' });
  req.project = result.rows[0];
  next();
};

const cascataAuth = async (req: any, res: any, next: NextFunction) => {
  const apikey = req.headers['apikey'] || req.query.apikey;
  if (apikey === req.project?.service_key) { req.userRole = 'service_role'; return next(); }
  if (apikey === req.project?.anon_key) { req.userRole = 'anon'; return next(); }
  next();
};

app.use(resolveProject as any);
app.use(auditLogger as any);

// --- WEBHOOK DISPATCHER ENGINE ---
// Em produção, isso estaria em um worker separado, mas aqui implementamos nativamente
const dispatchWebhooks = async (projectSlug: string, table: string, event: string, payload: any) => {
  const hooks = await systemPool.query(
    'SELECT * FROM system.webhooks WHERE project_slug = $1 AND table_name = $2 AND (event_type = $3 OR event_type = "*") AND is_active = true',
    [projectSlug, table, event]
  );

  hooks.rows.forEach(async (hook) => {
    try {
      await fetch(hook.target_url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Cascata-Event': event,
          'X-Cascata-Signature': hook.secret_header || ''
        },
        body: JSON.stringify({
          event,
          table,
          project: projectSlug,
          timestamp: new Date().toISOString(),
          data: payload
        })
      });
    } catch (e) {
      console.error(`[WEBHOOK ERROR] Failed to deliver to ${hook.target_url}`);
    }
  });
};

// --- API ROUTES (Exemplo de integração do Hook no INSERT) ---
app.post('/api/data/:slug/tables/:table/rows', cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.params;
  const { data } = req.body;
  
  // Lógica de inserção no Postgres (omitida para brevidade, mas assume sucesso)
  // ... insert logic ...
  
  // Dispara webhooks de forma assíncrona
  dispatchWebhooks(req.project.slug, table, 'INSERT', data);
  
  res.status(201).json({ success: true, data });
});

// --- REALTIME SSE ---
app.get('/api/data/:slug/realtime', cascataAuth as any, async (req: any, res: any) => {
  const { table } = req.query;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const dbName = req.project.db_name;
  const pool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${dbName}`) });
  const client = await pool.connect();
  await client.query(`LISTEN "cascata_changes_${table}"`);

  client.on('notification', (msg) => { res.write(`data: ${msg.payload}\n\n`); });
  req.on('close', () => { client.release(); pool.end(); });
});

app.listen(PORT, () => console.log(`[CASCATA INDEPENDENT ENGINE] Ativo na porta ${PORT}`));
