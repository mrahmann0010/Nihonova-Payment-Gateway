// requireAdmin.js — the gate on every /admin/api/* route.
//
// Moved out of routes/admin.js so the client-management routes can share the
// one implementation rather than re-deriving the session rules.
//
// Primary auth is the httpOnly JWT session cookie set at /admin/auth/login.
// The legacy shared ADMIN_TOKEN (header/query/bearer) is still accepted for
// scripts; it identifies nobody, which is why audit fields fall back to
// 'token' rather than a username.

const crypto = require('crypto');
const { verify: verifyJwt, COOKIE_NAME } = require('../services/jwt');

function requireAdmin(req, res, next) {
  // Primary auth: the httpOnly JWT session cookie set at /admin/auth/login.
  const sessionToken = req.cookies?.[COOKIE_NAME];
  if (sessionToken) {
    try {
      const payload = verifyJwt(sessionToken);
      req.adminUser = payload.username || 'admin';
      return next();
    } catch {
      // Fall through to the legacy token check below.
    }
  }

  // Legacy auth: shared ADMIN_TOKEN via header/query/bearer. Kept for
  // backward compatibility (e.g. scripts); the dashboard now uses the cookie.
  const secret = process.env.ADMIN_TOKEN;
  const isPlaceholder = !secret || secret === 'your-admin-token-here';

  if (isPlaceholder) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Admin] ADMIN_TOKEN not configured in production — rejecting request');
      return res.status(503).json({ error: 'Admin disabled — ADMIN_TOKEN not configured' });
    }
    console.warn('[Admin] ADMIN_TOKEN not configured — auth disabled (dev only)');
    req.adminUser = 'dev';
    return next();
  }

  const header = req.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const token  = req.query.token || req.get('x-admin-token') || bearer;

  if (!token) return res.status(401).json({ error: 'Missing token' });

  const expected = Buffer.from(secret);
  const received = Buffer.from(String(token));
  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.adminUser = 'token';
  next();
}

module.exports = requireAdmin;
