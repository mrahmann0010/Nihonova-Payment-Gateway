// db.js — establishes and manages the Mongoose connection to MongoDB.
// Called once at startup from server.js. All models automatically reuse
// this shared connection; no need to pass it around.

const mongoose = require('mongoose');

async function connectDB() {
  // mongoose.connect returns a promise; we await it so server.js can
  // halt startup cleanly if the DB is unreachable.
  await mongoose.connect(process.env.MONGO_URI);
}

// Log every major connection lifecycle event so operators can see DB
// state in the console / log aggregator without adding extra tooling.
mongoose.connection.on('connected', () => {
  console.log('[DB] MongoDB connected:', mongoose.connection.host);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[DB] MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  // Errors after initial connection (e.g. network blip) land here.
  // Mongoose will attempt to auto-reconnect; we just log.
  console.error('[DB] MongoDB error:', err.message);
});

module.exports = connectDB;
