require('dotenv').config();

const path           = require('path');
const express        = require('express');
const connectDB      = require('./config/db');
const verifySignature = require('./middleware/verifySignature');
const webhookRouter  = require('./routes/webhook');
const adminRouter    = require('./routes/admin');

if (!process.env.MONGO_URI) {
  console.error('[Config] MONGO_URI is not set. Server cannot start without a database connection.');
  process.exit(1);
}

const app = express();

// EJS server-rendered views + static assets (CSS).
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

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

app.get('/', (_req, res) => res.render('home'));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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
