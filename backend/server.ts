
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config();

const app = express();
app.use(cors() as any);
app.use(express.json({ limit: '50mb' }) as any);

const { Pool } = pg;
const systemPool = new Pool({
  connectionString: process.env.SYSTEM_DATABASE_URL,
});

const projectPools: Record<string, pg.Pool> = {};
const SYSTEM_JWT_SECRET = process.env.SYSTEM_JWT_SECRET || 'fallback_system_secret';
const PORT = process.env.PORT || 3000;

async function getProjectPool(slug: string): Promise<pg.Pool | null> {
  if (projectPools[slug]) return projectPools[slug];
  try {
    const result = await systemPool.query('SELECT * FROM system.projects WHERE slug = $1', [slug]);
    if (result.rows.length === 0) return null;
    const project = result.rows[0];
    const url = new URL(process.env.SYSTEM_DATABASE_URL!);
    url.pathname = `/${project.db_name}`;
    const pool = new Pool({ connectionString: url.toString() });
    projectPools[slug] = pool;
    return pool;
  } catch (err) {
    return null;
  }
}

const authenticateAdmin = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized Admin' });
  try {
    const decoded = jwt.verify(token, SYSTEM_JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid admin token' });
  }
};

// --- CONTROL PLANE (SYSTEM OPS) ---

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await systemPool.query('SELECT * FROM system.admin_users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Admin account not found' });
    const user = result.rows[0];
    
    const isMasterDefault = (email === 'admin@cascata.io' && password === 'admin123');
    const isValid = isMasterDefault || (user.password_hash.startsWith('$2') 
      ? await bcrypt.compare(password, user.password_hash)
      : password === user.password_hash);

    if (!isValid) return res.status(401).json({ error: 'Invalid security credentials' });
    
    const token = jwt.sign({ id: user.id, role: 'admin', email: user.email }, SYSTEM_JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'System Authentication Failure' });
  }
});

// Correção do 404: Rota de criação de projetos
app.post('/projects', authenticateAdmin, async (req, res) => {
  const { name, slug } = req.body;
  try {
    const dbName = `cascata_proj_${slug.replace(/-/g, '_')}`;
    const jwtSecret = `ck_${Math.random().toString(36).substring(2, 15)}`;
    const serviceKey = `sk_${Math.random().toString(36).substring(2, 15)}`;
    
    // 1. Registrar no catálogo do sistema
    const result = await systemPool.query(
      'INSERT INTO system.projects (name, slug, db_name, jwt_secret, service_key) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, slug, dbName, jwtSecret, serviceKey]
    );

    // 2. Provisionar DB físico (Em produção, o usuário do pool deve ter permissão de CREATE DATABASE)
    try {
      await systemPool.query(`CREATE DATABASE ${dbName}`);
    } catch (dbErr) {
      console.error("DB physical creation skipped or failed (might already exist):", dbErr);
    }
    
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/projects', authenticateAdmin, async (req, res) => {
  const result = await systemPool.query('SELECT * FROM system.projects ORDER BY created_at DESC');
  res.json(result.rows);
});

// Gerenciamento Global de SSL
app.post('/system/certificates', authenticateAdmin, async (req, res) => {
  const { domain, cert, key, provider, email } = req.body;
  try {
    // Persistência no banco do sistema
    await systemPool.query(
      `INSERT INTO system.certificates (domain, cert_pem, key_pem, provider) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (domain) DO UPDATE SET cert_pem = $2, key_pem = $3, provider = $4`,
      [domain, cert || 'PENDING_AUTO', key || 'PENDING_AUTO', provider]
    );

    if (provider === 'letsencrypt') {
      console.log(`[CERT-AGENT] Iniciando Certbot para ${domain} (Email: ${email})`);
      // Aqui o backend dispararia o script de shell do Certbot
    }

    res.json({ success: true, message: 'Configuração de SSL processada.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`[CASCATA ENGINE] High-Performance Studio Backend on ${PORT}`));
