require('dotenv').config();

const express        = require('express');
const compression    = require('compression');
const cookieParser   = require('cookie-parser');
const { isDbReady }  = require('./config/db');
const verifySignature = require('./middleware/verifySignature');
const webhookRouter  = require('./routes/webhook');
const adminRouter    = require('./routes/admin');
const authRouter     = require('./routes/auth');
const log            = require('./services/logger');

if (!process.env.MONGO_URI) {
  log.error('CONFIG', 'nomongo', { note: 'MONGO_URI is not set — cannot start' });
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

// Gzip/brotli response compression. JSON payloads (payment lists, stats series)
// compress several-fold, cutting transfer time for the dashboard's data calls.
app.use(compression());

app.use(cookieParser());

app.use(
  express.json({
    verify(req, _res, buf) {
      req.rawBody = buf;
    },
  })
);

// Health check — registered *above* the readiness gate so it can still report
// while the DB is down. Without the DB every webhook and admin route 503s, so a
// healthy answer here would hide a fully broken container from the orchestrator.
app.get('/health', (_req, res) => {
  const ready = isDbReady();
  res
    .status(ready ? 200 : 503)
    .json({ status: ready ? 'ok' : 'degraded', db: ready ? 'connected' : 'disconnected' });
});

app.get('/favicon.ico', (_req, res) => res.status(204).end());

// API root — the UI now lives in the separate SvelteKit frontend.
app.get('/', (_req, res) => res.json({ service: 'smsServer', status: 'ok' }));

// Readiness gate for the data routes. The connection is opened once at startup
// and maintained by the driver, so this only *checks* state — it never dials.
// Refusing early with a 503 keeps a disconnect from turning into a query that
// sits buffered and then surfaces as an opaque 500; the SMS gateway retries a
// 503, so a blip costs a redelivery rather than a lost payment.
app.use((req, res, next) => {
  if (isDbReady()) return next();
  log.warn('DB', 'notready', { path: req.path });
  res.status(503).json({ error: 'Service unavailable' });
});

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
  log.error('APP', 'unhandled', { error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
