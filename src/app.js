require('dotenv').config();

const express        = require('express');
const connectDB      = require('./config/db');
const verifySignature = require('./middleware/verifySignature');
const webhookRouter  = require('./routes/webhook');

const app = express();

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

app.get('/', (_req, res) => {
  res.json({ status: 'running', message: 'bKash SMS Webhook Server is up.' });
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/webhooks', verifySignature, webhookRouter);

module.exports = app;
