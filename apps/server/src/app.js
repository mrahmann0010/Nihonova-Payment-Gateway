require('dotenv').config();

const express        = require('express');
const cookieParser   = require('cookie-parser');
const connectDB      = require('./config/db');
const verifySignature = require('./middleware/verifySignature');
const webhookRouter  = require('./routes/webhook');
const adminRouter    = require('./routes/admin');
const authRouter     = require('./routes/auth');

if (!process.env.MONGO_URI) {
  console.error('[Config] MONGO_URI is not set. Server cannot start without a database connection.');
  process.exit(1);
}

const app = express();

// CORS — the SvelteKit frontend is served from a different origin, so allow the
// configured origin(s) to call the JSON API with the admin-token header.
// CORS_ORIGIN is a comma-separated allowlist; '*' allows any origin.
const CORS_ORIGINS = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin))) {
    // Cookie auth requires credentialed CORS, which forbids a '*' origin — the
    // exact request origin must be echoed back instead.
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-admin-token, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(cookieParser());

app.use(
  express.json({
    verify(req, _res, buf) {
      req.rawBody = buf;
    },
  })
);

// Ensure a DB connection exists before any route handler runs.
// connectDB() is a no-op when already connected, so this is fast on warm instances.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    res.status(503).json({ error: 'Service unavailable' });
  }
});

app.get('/favicon.ico', (_req, res) => res.status(204).end());

// API root — the UI now lives in the separate SvelteKit frontend.
app.get('/', (_req, res) => res.json({ service: 'smsServer', status: 'ok' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/admin/auth', authRouter);

app.use('/admin', adminRouter);

app.use('/webhooks', verifySignature, webhookRouter);

// 404 — no route matched
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler — catches anything thrown by route handlers
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[App] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
