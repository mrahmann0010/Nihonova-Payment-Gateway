// server.js — Express application entry point.
//
// Responsibilities:
//   1. Load environment variables from .env
//   2. Connect to MongoDB (exit if unreachable)
//   3. Configure Express middleware (raw body capture, JSON parsing)
//   4. Mount routes
//   5. Start the HTTP server

require('dotenv').config(); // must be first — populates process.env before any other require

const express        = require('express');
const connectDB      = require('./config/db');
const verifySignature = require('./middleware/verifySignature');
const webhookRouter  = require('./routes/webhook');

const app  = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Raw body capture
//
// express.json() normally discards the raw buffer after parsing. We need the
// raw bytes to recompute the HMAC-SHA256 signature in verifySignature.js.
// The `verify` callback runs before JSON parsing and stores the raw Buffer on
// req.rawBody so the middleware can access it later.
// ---------------------------------------------------------------------------
app.use(
  express.json({
    verify(req, _res, buf) {
      req.rawBody = buf; // Buffer of the exact bytes received over the wire
    },
  })
);

// ---------------------------------------------------------------------------
// Health check — no auth required.
// Uptime monitors hit this endpoint; if it returns 200 the process is alive
// and the event loop is not blocked.
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// Webhook route
//
// verifySignature runs first (as a route-level middleware) so every request
// to /webhooks/* must carry a valid HMAC signature. The router then handles
// the business logic for individual paths under /webhooks.
//
// We intentionally apply signature verification only to /webhooks, not
// globally, so the /health endpoint remains freely accessible.
// ---------------------------------------------------------------------------
app.use('/webhooks', verifySignature, webhookRouter);

// ---------------------------------------------------------------------------
// Startup — connect to MongoDB then begin accepting HTTP requests.
//
// We connect before calling app.listen so that the very first webhook request
// doesn't arrive before Mongoose is ready. If connectDB throws (e.g. bad URI,
// network issue) we log and exit with a non-zero code so the process manager
// (PM2, Docker, etc.) knows to restart.
// ---------------------------------------------------------------------------
(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('[Server] Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
})();
