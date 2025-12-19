
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
    const isInternal = req.headers.referer?.includes(req.headers.host || '') || false;

    if (req.project) {
      const authStatus = res.statusCode === 401 || res.statusCode === 403 ? 'SECURITY_ALERT' : 'AUTHORIZED';
      systemPool.query(
        `INSERT INTO system.api_logs 
        (project_slug, method, path, status_code, client_ip, duration_ms, user_role, payload, headers, user_agent, geo_info) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          req.project.slug, req.method, req.path, res.statusCode, clientIp, duration, 
          req.userRole || 'unauthorized', JSON.stringify(req.body || {}),
          JSON.stringify({ referer: req.headers.referer, host: req.headers.host }),
          req.headers['user-agent'], JSON.stringify({ is_internal: isInternal, auth_status: authStatus })
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
    let projectResult = await systemPool.query('SELECT * FROM system.projects WHERE custom_domain = $1', [host]);
    if (projectResult.rowCount === 0 && slugFromUrl) {
      projectResult = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1', [slugFromUrl]);
    }

    if (!projectResult.rows[0]) {
      if (req.path.startsWith('/api/data/')) return res.status(404).json({ error: 'Project infrastructure context not found.' });
      return next();
    }

    req.project = projectResult.rows[0];
    const dbName = req.project.db_name;
    req.projectPool = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL?.replace(/\/[^\/]+$/, `/${dbName}`) });
    next();
  } catch (e) { res.status(500).json({ error: 'DB Resolution Error' }); }
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

const cascataAuth = async (req: any, res: any, next: NextFunction) => {
  if (req.path.includes('/control/')) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Administrative Session Required' });
    try {
      const token = authHeader.split(' ')[1];
      jwt.verify(token, process.env.SYSTEM_JWT_SECRET || 'secret');
      return next();
    } catch (e) { return res.status(401).json({ error: 'Invalid or Expired Admin Session' }); }
  }

  const apikeyRaw = req.headers['apikey'] || req.query.apikey;
  const authHeader = req.headers['authorization'];
  const bearerToken = (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null)?.trim();
  const queryToken = req.query.token;
  const apikey = (apikeyRaw || bearerToken || queryToken)?.trim();

  if (bearerToken || queryToken) {
    try {
      jwt.verify((bearerToken || queryToken), process.env.SYSTEM_JWT_SECRET || 'secret');
      req.userRole = 'service_role';
      return next();
    } catch (e) {}
  }

  if (apikey === req.project?.service_key) { req.userRole = 'service_role'; return next(); }
  if (apikey === req.project?.anon_key) { req.userRole = 'anon'; }

  if ((bearerToken || queryToken) && req.project?.jwt_secret) {
    try {
      const decoded = jwt.verify((bearerToken || queryToken), req.project.jwt_secret);
      req.user = decoded; req.userRole = 'authenticated';
      return next();
    } catch (e) {}
  }

  if (!req.userRole) return res.status(401).json({ error: 'Access Denied: Invalid API Key or Authorization Token for this project context.' });
  next();
};

// --- CONTROL PLANE ---
app.get('/api/control/me/ip', (req: any, res: any) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.json({ ip });
});

app.get('/api/control/projects', cascataAuth as any, async (req, res) => {
  const result = await systemPool.query('SELECT * FROM system.projects ORDER BY created_at DESC');
  res.json(result.rows);
});

app.patch('/api/control/projects/:slug', cascataAuth as any, async (req: any, res: any) => {
  const { name, custom_domain, metadata } = req.body;
  const result = await systemPool.query(
    'UPDATE system.projects SET name = COALESCE($1, name), custom_domain = COALESCE($2, custom_domain), metadata = COALESCE($3, metadata), updated_at = now() WHERE slug = $4 RETURNING *',
    [name, custom_domain, metadata ? JSON.stringify(metadata) : null, req.params.slug]
  );
  res.json(result.rows[0]);
});

app.post('/api/control/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
  const admin = result.rows[0];
  if (admin && admin.password_hash === password) {
    const token = jwt.sign({ sub: admin.id, role: 'admin' }, process.env.SYSTEM_JWT_SECRET || 'secret');
    res.json({ token });
  } else res.status(401).json({ error: 'Invalid credentials' });
});

// --- STORAGE ENGINE ---

app.get('/api/data/:slug/storage/buckets', cascataAuth as any, async (req: any, res: any) => {
  const p = path.join(STORAGE_ROOT, req.project.slug);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  const items = fs.readdirSync(p).filter(f => fs.lstatSync(path.join(p, f)).isDirectory());
  res.json(items.map(name => ({ name })));
});

app.post('/api/data/:slug/storage/buckets', cascataAuth as any, async (req: any, res: any) => {
  const { name } = req.body;
  const p = path.join(STORAGE_ROOT, req.project.slug, name);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
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

app.post('/api/data/:slug/storage/:bucket/folder', cascataAuth as any, async (req: any, res: any) => {
  const { name, path: targetPath } = req.body;
  const p = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, targetPath || '', name);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  res.json({ success: true });
});

app.post('/api/data/:slug/storage/:bucket/upload', cascataAuth as any, upload.single('file') as any, async (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  // Governança de Storage Refinada
  const governance = req.project.metadata?.storage_governance;
  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  const size = req.file.size;

  if (governance) {
    let matchedSector: any = null;
    for (const [sectorId, config] of Object.entries(governance) as any) {
      if (sectorId !== 'global' && config.allowed_exts?.includes(ext)) {
        matchedSector = config;
        break;
      }
    }

    const policy = matchedSector || governance.global || { max_size: '100MB', allowed_exts: [] };
    
    // Converter human-readable size para bytes
    const parseSize = (s: string) => {
      const num = parseFloat(s);
      if (s.includes('GB')) return num * 1024 * 1024 * 1024;
      if (s.includes('MB')) return num * 1024 * 1024;
      if (s.includes('KB')) return num * 1024;
      return num;
    };

    const maxBytes = parseSize(policy.max_size);

    // Validação estrita
    if (matchedSector && !policy.allowed_exts?.includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: `O formato .${ext} foi desabilitado para este setor.` });
    }

    if (size > maxBytes) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: `O arquivo excede o limite de ${policy.max_size} definido na política.` });
    }
  }

  const targetPath = req.body.path || '';
  const dest = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, targetPath, req.file.originalname);
  if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(req.file.path, dest);
  res.json({ success: true, name: req.file.originalname });
});

app.get('/api/data/:slug/storage/:bucket/object/:path(*)', cascataAuth as any, async (req: any, res: any) => {
  const full = path.join(STORAGE_ROOT, req.project.slug, req.params.bucket, req.params.path);
  if (fs.existsSync(full) && !fs.lstatSync(full).isDirectory()) {
    res.sendFile(full);
  } else res.status(404).json({ error: 'Asset not found.' });
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

// --- DATA PLANE CRUD ---
app.post('/api/data/:slug/query', cascataAuth as any, async (req: any, res: any) => {
  const { sql } = req.body;
  try { const result = await req.projectPool.query(sql); res.json(result); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/data/:slug/tables', cascataAuth as any, async (req: any, res: any) => {
  const result = await req.projectPool.query("SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public'");
  res.json(result.rows);
});

app.get('/api/data/:slug/stats', cascataAuth as any, async (req: any, res: any) => {
  const tables = await req.projectPool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
  const users = await req.projectPool.query("SELECT count(*) FROM auth.users").catch(() => ({ rows: [{ count: 0 }] }));
  const size = await req.projectPool.query("SELECT pg_size_pretty(pg_database_size(current_database()))");
  res.json({ tables: parseInt(tables.rows[0].count), users: parseInt(users.rows[0].count), size: size.rows[0].pg_size_pretty });
});

app.listen(PORT, () => console.log(`[CASCATA MASTER ENGINE] v3.3 Governance-Aware Storage na porta ${PORT}`));
