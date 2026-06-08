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

function verifySignature(req, res, next) {
  const secret = process.env.WEBHOOK_SECRET;

  // If no secret is configured (or still the placeholder), skip auth.
  // Always set a real secret in production.
  if (!secret || secret === 'your-shared-secret-here') {
    console.warn('[Auth] WEBHOOK_SECRET not configured — auth disabled');
    return next();
  }

  const token = req.query.token;

  if (!token) {
    console.warn('[Auth] Missing ?token query parameter');
    return res.status(401).json({ error: 'Missing token' });
  }

  const expected = Buffer.from(secret);
  const received = Buffer.from(token);

  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    console.warn('[Auth] Invalid token — request rejected');
    return res.status(401).json({ error: 'Invalid token' });
  }

  next();
}

module.exports = verifySignature;
