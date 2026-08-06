// Server entry point — long-running Node process (VPS / container / bare metal).
// Connects to MongoDB once at startup, then starts listening. Handles graceful
// shutdown so in-flight requests finish and the DB connection closes cleanly.

require('dotenv').config();

const mongoose  = require('mongoose');
const app       = require('./app');
const connectDB = require('./config/db');
const log       = require('./services/logger');

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();

  const server = app.listen(PORT, () => {
    log.info('SERVER', 'listening', { port: PORT, env: process.env.NODE_ENV || 'development' });
  });

  async function shutdown(signal) {
    log.info('SERVER', 'shutdown', { signal });
    server.close(async () => {
      await mongoose.connection.close();
      log.info('SERVER', 'stopped', { clean: true });
      process.exit(0);
    });
    // Force-exit if graceful shutdown hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Node exits on an unhandled rejection, and the container policy restarts us —
  // so a recurring bug becomes a silent crash loop that drops every inbound SMS.
  // Log loudly with the full stack first, then let the restart happen.
  function fatal(kind, err) {
    log.error('SERVER', 'fatal', { kind, error: err instanceof Error ? err.message : String(err) });
    if (err instanceof Error) console.error(err.stack);
    server.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 5_000).unref();
  }

  process.on('unhandledRejection', (reason) => fatal('Unhandled rejection', reason));
  process.on('uncaughtException', (err) => fatal('Uncaught exception', err));
}

start().catch((err) => {
  log.error('SERVER', 'startfail', { error: err.message });
  process.exit(1);
});
