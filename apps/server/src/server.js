// Server entry point — long-running Node process (VPS / container / bare metal).
// Connects to MongoDB once at startup, then starts listening. Handles graceful
// shutdown so in-flight requests finish and the DB connection closes cleanly.

require('dotenv').config();

const mongoose  = require('mongoose');
const app       = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT}`);
  });

  async function shutdown(signal) {
    console.log(`[Server] ${signal} received — shutting down`);
    server.close(async () => {
      await mongoose.connection.close();
      console.log('[Server] Closed cleanly');
      process.exit(0);
    });
    // Force-exit if graceful shutdown hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[Server] Failed to start:', err.message);
  process.exit(1);
});
