// clientSecret.js — generation, strength rules and hashing for client secrets.
//
// These secrets are admin-chosen, which is the whole reason this file exists.
// A generated 32-byte secret is unguessable by construction; a typed one is
// only as good as what was typed, and "nihonova2025" behind a fast hash is
// brute-forceable offline in seconds. So the entropy that SHA-256 assumes is
// enforced here instead, server-side, before anything is stored — the UI's
// matching check (web: $lib/secret.ts) is a convenience, not the gate.

const crypto = require('crypto');

const MIN_LENGTH = 32;
const MAX_LENGTH = 200;
// Below this, a long secret is just a short one repeated.
const MIN_DISTINCT = 16;
const MIN_CLASSES = 3;

// A strong secret, for the UI's "Generate" affordance to fall back on. The
// dashboard normally generates in the browser so no plaintext ever crosses the
// wire; this is here for scripts and tests.
function generateSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

// Returns an error message, or null when the secret is acceptable. The message
// is shown to the admin verbatim, so it says what to fix.
function validateSecret(secret, { clientId = '' } = {}) {
  if (typeof secret !== 'string' || !secret) return 'Secret is required';
  if (/\s/.test(secret)) return 'Secret cannot contain spaces or line breaks';
  if (secret.length < MIN_LENGTH) return `Secret must be at least ${MIN_LENGTH} characters`;
  if (secret.length > MAX_LENGTH) return `Secret must be at most ${MAX_LENGTH} characters`;

  if (new Set(secret).size < MIN_DISTINCT)
    return `Secret must use at least ${MIN_DISTINCT} different characters`;

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(secret)).length;
  if (classes < MIN_CLASSES)
    return 'Secret must mix at least three of: lowercase, uppercase, digits, symbols';

  // A secret containing its own client id is a guess away from being derived.
  if (clientId && secret.toLowerCase().includes(clientId.toLowerCase()))
    return 'Secret must not contain the client ID';

  return null;
}

const hashSecret = (secret) => crypto.createHash('sha256').update(secret, 'utf8').digest('hex');

// Constant-time compare of two hex digests. Both are fixed-length SHA-256
// output, so a length mismatch only ever means a malformed stored value.
function hashesEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

module.exports = {
  MIN_LENGTH,
  MAX_LENGTH,
  MIN_DISTINCT,
  MIN_CLASSES,
  generateSecret,
  validateSecret,
  hashSecret,
  hashesEqual,
};
