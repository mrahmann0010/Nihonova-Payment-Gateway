// Establishes and caches the Mongoose connection.
// Called once at startup (see server.js); the readyState guard also makes it a
// safe no-op if invoked again, so callers never open a second connection.

const mongoose = require('mongoose');

async function connectDB() {
  // readyState 1 = connected, 2 = connecting (Mongoose will resolve it)
  if (mongoose.connection.readyState >= 1) return;
  await mongoose.connect(process.env.MONGO_URI);
}

mongoose.connection.on('connected', () => {
  console.log('[DB] MongoDB connected:', mongoose.connection.host);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[DB] MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('[DB] MongoDB error:', err.message);
});

module.exports = connectDB;
