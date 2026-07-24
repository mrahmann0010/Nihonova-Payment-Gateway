// jwt.js — sign/verify the admin session token and manage the auth cookie.
//
// The JWT lives in an httpOnly cookie so client JS can never read it (XSS-safe)
// and the browser attaches it automatically — no per-request token handling in
// the frontend. Cross-origin (SvelteKit ↔ API) requires SameSite=None+Secure in
// production; in dev both run on localhost (same-site) so Lax over http works.

const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'admin_session';
const MAX_AGE_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s === 'change-me') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is not configured');
    }
    return 'dev-insecure-secret';
  }
  return s;
}

function sign(user) {
  return jwt.sign({ sub: String(user._id), username: user.username }, secret(), {
    expiresIn: '7d',
  });
}

function verify(token) {
  return jwt.verify(token, secret());
}

function setCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

function clearCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  });
}

module.exports = { COOKIE_NAME, sign, verify, setCookie, clearCookie };
