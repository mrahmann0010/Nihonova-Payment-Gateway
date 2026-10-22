// claims.js — the admin side of the redemption ledger.
//
// Routes (all under /admin/api/claims, all behind requireAdmin; every write
// additionally behind csrfGuard):
//   GET  /                  → the claims ledger, keyset-paged, newest first
//   POST /:id/release       → hand a payment back so it can be claimed again
//
// The consuming apps' side is routes/v1.js. These two never share a credential:
// a business can create a claim and nothing else, and only an admin can undo
// one. That split is the point — release is the only operation in the system
// that makes a spent payment spendable again, so putting it behind a client
// secret would mean a leaked secret could release-and-reclaim at will.

const express   = require('express');
const { Types } = require('mongoose');
const router    = express.Router();

const Claim  = require('../models/Claim');
const requireAdmin = require('../middleware/requireAdmin');
const csrfGuard    = require('../middleware/csrfGuard');
const { normaliseTrxId } = require('../services/trxId');
const log = require('../services/logger');

router.use(requireAdmin, csrfGuard);

const DEFAULT_LIMIT = 25;
const MAX_LIMIT     = 100;
const MAX_REASON    = 500;

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

function serialize(doc) {
  return {
    id:       String(doc._id),
    trxId:    doc.trxId,
    platform: doc.platform,
    amount:   doc.amount,
    sender:   doc.sender,

    expectedAmount: doc.expectedAmount,
    overpaidBy:     doc.overpaidBy,
    underpaidBy:    doc.underpaidBy ?? 0,

    clientId:       doc.clientId,
    orderRef:       doc.orderRef,
    idempotencyKey: doc.idempotencyKey,

    state:         doc.state,
    claimedAt:     doc.claimedAt,
    releasedAt:    doc.releasedAt,
    releaseReason: doc.releaseReason,
    releasedBy:    doc.releasedBy,
  };
}

// Newest first with _id as tie-break: two claims can share a millisecond, and
// the keyset cursor needs a strict total order. Mirrors admin.js's payment
// paging so the two ledgers behave identically as an admin scrolls.
const PAGE_SORT = { claimedAt: -1, _id: -1 };

const encodeCursor = (doc) => `${doc.claimedAt.toISOString()}_${doc._id}`;

function decodeCursor(raw) {
  if (!raw) return null;
  const [iso, id] = String(raw).split('_');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()) || !/^[0-9a-f]{24}$/i.test(id || '')) {
    throw badRequest('Invalid cursor');
  }
  return { date, id: new Types.ObjectId(id) };
}

// ---------------------------------------------------------------------------
// GET /admin/api/claims
//   ?clientId=  &state=claimed|released|all  &trxId=  &limit=25  &cursor=
//
// Keyset-paged on (claimedAt, _id), never skip/offset, so a page costs the same
// however deep the ledger goes. `trxId` is an exact match rather than a prefix:
// this list exists to answer "what happened to THIS transaction", and an
// anchored-prefix search here would rebuild the fishing surface that the
// payments endpoint is already being hardened against.
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );

    const clauses = [];

    const clientId = String(req.query.clientId ?? '').trim().toLowerCase();
    if (clientId) clauses.push({ clientId });

    const state = String(req.query.state ?? '').trim();
    if (state && state !== 'all') {
      if (state !== 'claimed' && state !== 'released')
        throw badRequest('state must be claimed, released or all');
      clauses.push({ state });
    }

    // Normalised the same way the claim path stores it, so an admin pasting an
    // ID out of a student's screenshot finds the row whatever they paste it as.
    const trxId = normaliseTrxId(req.query.trxId);
    if (trxId) clauses.push({ trxId });

    const cursor = decodeCursor(req.query.cursor);
    if (cursor) {
      clauses.push({
        $or: [
          { claimedAt: { $lt: cursor.date } },
          { claimedAt: cursor.date, _id: { $lt: cursor.id } },
        ],
      });
    }

    const filter = clauses.length > 1 ? { $and: clauses } : (clauses[0] || {});

    // One extra row tells us whether another page exists without a count.
    const docs = await Claim.find(filter).sort(PAGE_SORT).limit(limit + 1).lean();
    const page = docs.slice(0, limit);

    res.json({
      claims: page.map(serialize),
      nextCursor: docs.length > limit ? encodeCursor(page[page.length - 1]) : null,
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /admin/api/claims/:id/release
//   { reason }
//
// Moves a claim to 'released', which drops it out of the partial unique index
// on trxId and so makes the payment claimable again. The row is never deleted:
// a delete would make the payment silently re-claimable AND erase the evidence
// that it was ever spent, which is precisely the history you want at the moment
// someone disputes a refund.
// ---------------------------------------------------------------------------
router.post('/:id/release', async (req, res, next) => {
  try {
    if (!/^[0-9a-f]{24}$/i.test(req.params.id || '')) throw badRequest('Invalid claim id');

    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) throw badRequest('A reason is required to release a claim');
    if (reason.length > MAX_REASON) throw badRequest('Reason is too long');

    // Conditional update rather than read-modify-write: the filter carries
    // state:'claimed', so two admins clicking Release at the same moment
    // produce one release and one 409 instead of two releases and a confusing
    // audit trail. Same principle as the claim insert itself.
    const doc = await Claim.findOneAndUpdate(
      { _id: req.params.id, state: 'claimed' },
      {
        $set: {
          state: 'released',
          releasedAt: new Date(),
          releaseReason: reason,
          releasedBy: req.adminUser,
        },
      },
      { new: true }
    );

    if (!doc) {
      // Either it does not exist or it was already released. Say which, since
      // this surface is admin-only and there is no caller to withhold it from.
      const existing = await Claim.findById(req.params.id).lean();
      if (!existing) {
        const e = new Error('Claim not found');
        e.status = 404;
        throw e;
      }
      return res.status(409).json({
        error: 'That claim was already released',
        releasedAt: existing.releasedAt,
        releasedBy: existing.releasedBy,
      });
    }

    log.warn('CLAIM', 'released', {
      platform: doc.platform,
      amount:   doc.amount,
      trx:      doc.trxId,
      was:      doc.clientId,
      by:       req.adminUser,
      reason,
    });

    res.json({ claim: serialize(doc) });
  } catch (err) { next(err); }
});

// Route-local error shaping — matches routes/clients.js.
router.use((err, _req, res, next) => {
  if (err.status === 400 || err.status === 404) {
    return res.status(err.status).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
