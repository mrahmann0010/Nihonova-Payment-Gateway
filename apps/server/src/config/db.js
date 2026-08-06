// Establishes the single Mongoose connection for the process.
//
// This is a long-running server, so connect() is called exactly once from
// server.js before the listener opens. The driver owns reconnection after that
// — nothing in the request path should ever call this.

const mongoose = require('mongoose');
const log      = require('../services/logger');

// Explicit pool/timeout settings. The defaults are tuned for a generic client,
// not a small always-on API: maxPoolSize 100 is far more than this workload
// needs (and burns connections on a shared cluster), and the 30s server
// selection timeout means every request hangs half a minute while Mongo is
// unreachable instead of failing fast enough to be retried.
const CONNECT_OPTIONS = {
  maxPoolSize: 20,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS: 45_000,
  // Cap how long a query may sit queued during a reconnect. Buffering is kept
  // (a brief blip shouldn't fail a webhook) but bounded well under the
  // gateway's patience.
  bufferTimeoutMS: 5_000,
};

// Dedupes concurrent callers during the initial connect so a burst can never
// start two attempts.
let connecting = null;

async function connectDB() {
  // 1 = connected. States 2 (connecting) and 3 (disconnecting) must NOT be
  // treated as ready — returning early on 2 hands back a connection that isn't
  // usable yet, and on 3 one that's being torn down.
  if (mongoose.connection.readyState === 1) return;

  if (!connecting) {
    connecting = mongoose.connect(process.env.MONGO_URI, CONNECT_OPTIONS).finally(() => {
      connecting = null;
    });
  }

  await connecting;
}

// True only when queries can actually be served right now.
function isDbReady() {
  return mongoose.connection.readyState === 1;
}

mongoose.connection.on('connected', () => {
  log.info('DB', 'connected', { host: mongoose.connection.host });
});

mongoose.connection.on('disconnected', () => {
  log.warn('DB', 'disconnect');
});

mongoose.connection.on('error', (err) => {
  log.error('DB', 'error', { error: err.message });
});

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.isDbReady = isDbReady;
