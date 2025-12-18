
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.SYSTEM_DATABASE_URL,
});

const SERVICE_MODE = process.env.SERVICE_MODE || 'CONTROL_PLANE';
const PORT = process.env.PORT || 3000;

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', mode: SERVICE_MODE });
});

// Control Plane Routes
if (SERVICE_MODE === 'CONTROL_PLANE') {
  app.get('/projects', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM system.projects');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/projects', async (req, res) => {
    const { name, slug, database_url } = req.body;
    const jwt_secret = Math.random().toString(36).substring(2, 15);
    const service_key = `ck_${Math.random().toString(36).substring(2, 15)}`;
    
    try {
      const result = await pool.query(
        'INSERT INTO system.projects (name, slug, database_url, jwt_secret, service_key) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [name, slug, database_url, jwt_secret, service_key]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Could not create project' });
    }
  });
}

// Data Plane Routes (Dynamic REST API)
if (SERVICE_MODE === 'DATA_PLANE') {
  app.get('/:table', async (req, res) => {
    const { table } = req.params;
    const projectId = req.headers['x-project-id'];
    
    // In a real scenario, we'd lookup the project-specific connection here
    res.json({ message: `Data plane fetch for table ${table} in project ${projectId}` });
  });
}

app.listen(PORT, () => {
  console.log(`Cascata ${SERVICE_MODE} listening on port ${PORT}`);
});
