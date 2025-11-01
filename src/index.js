require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const client = require('prom-client');

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'db',
  port: process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT) : 5432,
  user: process.env.POSTGRES_USER || 'unifiap',
  password: process.env.POSTGRES_PASSWORD || 'unifiap-pass',
  database: process.env.POSTGRES_DB || 'unifiap'
});

async function ensureSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id uuid PRIMARY KEY,
        amount numeric NOT NULL,
        pix_key varchar(255) NOT NULL,
        status varchar(50) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  } finally {
    client.release();
  }
}

const app = express();
app.use(express.json());

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix: 'unifiap_' });
const paymentsCounter = new client.Counter({
  name: 'unifiap_payments_created_total',
  help: 'Total number of payments created'
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/payments', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM payments ORDER BY created_at DESC LIMIT 100');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db-error' });
  }
});

app.post('/payments', async (req, res) => {
  const { amount, pix_key } = req.body;
  if (!amount || !pix_key) return res.status(400).json({ error: 'missing fields' });

  const id = uuidv4();
  try {
    await pool.query('INSERT INTO payments(id, amount, pix_key, status) VALUES($1,$2,$3,$4)', [id, amount, pix_key, 'created']);
    // Simulate sending to PIX gateway (placeholder)
    // increment prometheus metric
    try { paymentsCounter.inc(); } catch (e) { /* ignore metric errors */ }
    res.status(201).json({ id, status: 'created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db-error' });
  }
});

// start
ensureSchema().then(() => {
  app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
}).catch(err => {
  console.error('Failed to setup DB schema:', err);
  process.exit(1);
});
