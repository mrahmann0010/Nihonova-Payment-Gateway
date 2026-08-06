// verifySignature.js — Express middleware that authenticates incoming webhook
// requests from the "Incoming SMS to URL Forwarder" Android app.
//
// The app does not support HMAC signing; authentication is done via a secret
// token embedded in the URL as a query parameter (?token=...).
// Set WEBHOOK_SECRET in .env and configure the app URL as:
//   https://yourserver.com/webhooks/sms?token=YOUR_SECRET
//
// Uses crypto.timingSafeEqual to prevent timing attacks.

const crypto = require('crypto');
const log    = require('../services/logger');

function verifySignature(req, res, next) {
  const secret = process.env.WEBHOOK_SECRET;

  // In production, a missing or placeholder secret is a misconfiguration —
  // reject all requests rather than silently exposing the endpoint.
  const isPlaceholder = !secret || secret === 'your-shared-secret-here';
  if (isPlaceholder) {
    if (process.env.NODE_ENV === 'production') {
      log.error('AUTH', 'nosecret', { note: 'WEBHOOK_SECRET unset in production' });
      return res.status(503).json({ error: 'Server misconfigured' });
    }
    log.warn('AUTH', 'nosecret', { note: 'auth disabled (dev only)' });
    return next();
  }

  const token = req.query.token;

  if (!token) {
    log.warn('AUTH', 'notoken', { ip: req.ip });
    return res.status(401).json({ error: 'Missing token' });
  }

  const expected = Buffer.from(secret);
  const received = Buffer.from(token);

  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    log.warn('AUTH', 'badtoken', { ip: req.ip });
    return res.status(401).json({ error: 'Invalid token' });
  }

  next();
}

module.exports = verifySignature;
