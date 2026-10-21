// clients.js — admin CRUD for registered consuming apps (businesses).
//
// Routes (all under /admin/api/clients, all behind requireAdmin; every write
// additionally behind csrfGuard):
//   GET    /                        → list, newest first
//   POST   /                        → register a business + set its first secret
//   PATCH  /:clientId               → business fields, policy, active flag
//   POST   /:clientId/rotate        → issue a new secret, old one valid for a grace window
//   POST   /:clientId/revoke-previous → close the grace window immediately
//
// One rule runs through all of it: **a plaintext secret never appears in a
// response, and never reaches this server in a form it keeps.** The admin types
// it (or the browser generates it locally); we hash it on arrival and store
// only the digest. There is no reveal endpoint because there is nothing to
// reveal — a lost secret is rotated, not recovered.

const express = require('express');
const router  = express.Router();

const Client = require('../models/Client');
const { PAST_SECRET_LIMIT, CLIENT_ID_RE } = require('../models/Client');
const requireAdmin = require('../middleware/requireAdmin');
const csrfGuard    = require('../middleware/csrfGuard');
const { validateSecret, hashSecret } = require('../services/clientSecret');
const log = require('../services/logger');

router.use(requireAdmin, csrfGuard);

// Default overlap when rotating. Long enough to redeploy an app by hand,
// short enough that a compromised old secret isn't valid for another week.
const DEFAULT_GRACE_HOURS = 24;
const MAX_GRACE_HOURS     = 24 * 14;

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

// The wire shape. Note what is absent: every *Hash field. They are `select:
// false` on the schema too, so omitting them here is the second lock, not the
// only one.
function serialize(doc) {
  const graceOpen = !!(doc.previousExpiresAt && doc.previousExpiresAt > new Date());
  return {
    clientId:   doc.clientId,
    name:       doc.name,
    active:     doc.active,

    ownerName:  doc.ownerName,
    ownerEmail: doc.ownerEmail,
    ownerPhone: doc.ownerPhone,
    notes:      doc.notes,

    maxClaimAmount:  doc.maxClaimAmount,
    claimWindowDays: doc.claimWindowDays,
    requireSenderMatch: doc.requireSenderMatch,

    secretSetAt: doc.secretSetAt,
    rotatedAt:   doc.rotatedAt,
    lastUsedAt:  doc.lastUsedAt,
    // Surfaced so the UI can warn that two secrets currently authenticate.
    previousExpiresAt: graceOpen ? doc.previousExpiresAt : null,

    createdBy: doc.createdBy,
    updatedBy: doc.updatedBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// Trim a string field, or undefined when the caller didn't send it — so a
// PATCH that omits a field leaves it alone rather than blanking it.
function optionalString(body, key, max = 500) {
  if (!(key in body)) return undefined;
  const v = String(body[key] ?? '').trim();
  if (v.length > max) throw badRequest(`${key} is too long`);
  return v;
}

// A positive integer, or null to clear the limit.
function optionalLimit(body, key) {
  if (!(key in body)) return undefined;
  const raw = body[key];
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw badRequest(`${key} must be a positive number`);
  return n;
}

// Shared by create and rotate: validate the typed secret, then refuse it if it
// is already in use ANYWHERE. The realistic mistake here isn't a weak secret,
// it's pasting the same value into both businesses — which would silently
// collapse two identities into one.
async function acceptSecret(secret, { clientId, excludeId = null }) {
  const problem = validateSecret(secret, { clientId });
  if (problem) throw badRequest(problem);

  const hash = hashSecret(secret);
  const clash = await Client.findOne({
    secretHash: hash,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).select('clientId').lean();
  if (clash) throw badRequest('That secret is already in use by another client');

  return hash;
}

async function findClient(clientId, { withHashes = false } = {}) {
  const q = Client.findOne({ clientId: String(clientId || '').toLowerCase() });
  if (withHashes) q.select('+secretHash +previousSecretHash +pastSecretHashes');
  const doc = await q.exec();
  if (!doc) {
    const e = new Error('Client not found');
    e.status = 404;
    throw e;
  }
  return doc;
}

// ---------------------------------------------------------------------------
// GET /admin/api/clients
// ---------------------------------------------------------------------------
router.get('/', async (_req, res, next) => {
  try {
    const docs = await Client.find().sort({ createdAt: -1 }).exec();
    res.json({ clients: docs.map(serialize) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /admin/api/clients — register a business and set its first secret.
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const clientId = String(body.clientId ?? '').trim().toLowerCase();
    const name     = String(body.name ?? '').trim();

    if (!CLIENT_ID_RE.test(clientId))
      throw badRequest('Client ID must be 3–40 lowercase letters, digits or hyphens, starting with a letter');
    if (!name) throw badRequest('Business name is required');

    if (await Client.exists({ clientId })) throw badRequest('That client ID is already taken');

    const secretHash = await acceptSecret(String(body.secret ?? ''), { clientId });

    const doc = await Client.create({
      clientId,
      name,
      ownerName:  optionalString(body, 'ownerName')  ?? '',
      ownerEmail: optionalString(body, 'ownerEmail') ?? '',
      ownerPhone: optionalString(body, 'ownerPhone') ?? '',
      notes:      optionalString(body, 'notes', 2000) ?? '',
      maxClaimAmount:  optionalLimit(body, 'maxClaimAmount')  ?? null,
      claimWindowDays: optionalLimit(body, 'claimWindowDays') ?? null,
      requireSenderMatch: !!body.requireSenderMatch,
      secretHash,
      secretSetAt: new Date(),
      createdBy: req.adminUser,
      updatedBy: req.adminUser,
    });

    log.info('CLIENT', 'created', { clientId, by: req.adminUser });
    res.status(201).json({ client: serialize(doc) });
  } catch (err) {
    // Unique index on clientId — a concurrent create beat us to it.
    if (err.code === 11000) return res.status(400).json({ error: 'That client ID is already taken' });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/api/clients/:clientId — business fields, policy, active flag.
// Never touches the credential; rotation is its own route.
// ---------------------------------------------------------------------------
router.patch('/:clientId', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const doc  = await findClient(req.params.clientId);

    if ('name' in body) {
      const name = String(body.name ?? '').trim();
      if (!name) throw badRequest('Business name is required');
      doc.name = name;
    }

    for (const key of ['ownerName', 'ownerEmail', 'ownerPhone']) {
      const v = optionalString(body, key);
      if (v !== undefined) doc[key] = v;
    }
    const notes = optionalString(body, 'notes', 2000);
    if (notes !== undefined) doc.notes = notes;

    for (const key of ['maxClaimAmount', 'claimWindowDays']) {
      const v = optionalLimit(body, key);
      if (v !== undefined) doc[key] = v;
    }

    if ('active' in body) doc.active = !!body.active;
    if ('requireSenderMatch' in body) doc.requireSenderMatch = !!body.requireSenderMatch;

    doc.updatedBy = req.adminUser;
    await doc.save();

    log.info('CLIENT', 'updated', { clientId: doc.clientId, active: doc.active, by: req.adminUser });
    res.json({ client: serialize(doc) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /admin/api/clients/:clientId/rotate
//   { secret, graceHours? }
//
// The old secret keeps authenticating for `graceHours` so the consuming app can
// be redeployed first. Without that overlap every rotation is an outage.
// ---------------------------------------------------------------------------
router.post('/:clientId/rotate', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const doc  = await findClient(req.params.clientId, { withHashes: true });

    const secret = String(body.secret ?? '');
    const hash   = await acceptSecret(secret, { clientId: doc.clientId, excludeId: doc._id });

    // Refuse a rotation that goes back to a secret this client already retired
    // — including the one currently live.
    const retired = [doc.secretHash, ...(doc.pastSecretHashes ?? [])];
    if (retired.includes(hash))
      throw badRequest('That secret was used before — choose one this client has never had');

    let graceHours = DEFAULT_GRACE_HOURS;
    if ('graceHours' in body) {
      const n = Number(body.graceHours);
      if (!Number.isFinite(n) || n < 0 || n > MAX_GRACE_HOURS)
        throw badRequest(`graceHours must be between 0 and ${MAX_GRACE_HOURS}`);
      graceHours = n;
    }

    doc.previousSecretHash = graceHours > 0 ? doc.secretHash : null;
    doc.previousExpiresAt  = graceHours > 0
      ? new Date(Date.now() + graceHours * 3600_000)
      : null;

    doc.pastSecretHashes = [doc.secretHash, ...(doc.pastSecretHashes ?? [])].slice(0, PAST_SECRET_LIMIT);
    doc.secretHash  = hash;
    doc.secretSetAt = new Date();
    doc.rotatedAt   = new Date();
    doc.updatedBy   = req.adminUser;
    await doc.save();

    log.info('CLIENT', 'rotated', { clientId: doc.clientId, graceHours, by: req.adminUser });
    res.json({ client: serialize(doc) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /admin/api/clients/:clientId/revoke-previous
//
// Separate from rotate on purpose: rotate is routine maintenance, this is the
// compromise response. It ends the grace window now, so only the newest secret
// authenticates from this moment on.
// ---------------------------------------------------------------------------
router.post('/:clientId/revoke-previous', async (req, res, next) => {
  try {
    const doc = await findClient(req.params.clientId, { withHashes: true });

    doc.previousSecretHash = null;
    doc.previousExpiresAt  = null;
    doc.updatedBy = req.adminUser;
    await doc.save();

    log.warn('CLIENT', 'revoked_previous', { clientId: doc.clientId, by: req.adminUser });
    res.json({ client: serialize(doc) });
  } catch (err) { next(err); }
});

// Route-local error shaping — 400/404 carry their message, anything else falls
// through to the app-wide handler as an opaque 500.
router.use((err, _req, res, next) => {
  if (err.status === 400 || err.status === 404) {
    return res.status(err.status).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
