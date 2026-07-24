// auth.js — session auth for the admin dashboard.
//
//   POST /admin/auth/login   { username, password } → sets httpOnly cookie
//   POST /admin/auth/logout  → clears the cookie
//   GET  /admin/auth/me      → { username } if the cookie is valid, else 401
//
// Replaces the old shared ADMIN_TOKEN flow. Verification is a fast bcrypt
// compare against the users collection; the returned cookie is what every
// subsequent /admin/api/* request is authenticated with.

const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();

const User = require('../models/User');
const { sign, verify, setCookie, clearCookie, COOKIE_NAME } = require('../services/jwt');

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ username: String(username).toLowerCase().trim() });
    // Always run a compare (even with no user) to avoid leaking which usernames
    // exist via response timing.
    const hash = user ? user.passwordHash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
    const ok = await bcrypt.compare(String(password), hash);

    if (!user || !ok) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    setCookie(res, sign(user));
    res.json({ username: user.username });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (_req, res) => {
  clearCookie(res);
  res.status(204).end();
});

router.get('/me', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = verify(token);
    res.json({ username: payload.username });
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
});

module.exports = router;
