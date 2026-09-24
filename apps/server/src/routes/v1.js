// v1.js — the public API consuming apps call at checkout. Mounted at /v1,
// deliberately NOT under /admin.
//
//   POST /v1/claims   spend a payment, exactly once, globally
//
// This is the whole single-use feature. Verification used to be a read
// (GET /admin/api/payments?search=<trxId>) with no side effect, so the same
// payment could be redeemed by both businesses on the shared receiving number,
// and repeatedly within one. Here the claim is a *write*, and the insert is the
// lock: nothing reads "is this free?" before deciding. Insert succeeds → the
// caller owns the payment. Duplicate key → someone else already does.
//
// No list, no search, no read. A client credential can claim and nothing else,
// so a leaked secret cannot enumerate the other business's ledger.
//
// No csrfGuard here, unlike the admin routes: this authenticates with a Bearer
// header rather than a cookie, so a browser has nothing to attach and there is
// no cross-site surface to guard.

const express = require('express');
const router  = express.Router();

const Bkash  = require('../models/Bkash');
const Nagad  = require('../models/Nagad');
const Rocket = require('../models/Rocket');
const Claim  = require('../models/Claim');
const requireClient = require('../middleware/requireClient');
const log = require('../services/logger');

const MODELS = { bkash: Bkash, nagad: Nagad, rocket: Rocket };

const MAX_ORDER_REF = 200;
const MAX_IDEM_KEY  = 200;

// One shape for every refusal, so consuming apps can switch on `reason` rather
// than parsing prose. `retryable` is only ever true for not_found — see below.
function refuse(res, status, reason, extra = {}) {
  return res.status(status).json({ claimed: false, reason, ...extra });
}

// The wire shape of a successful claim. Also what an idempotent replay returns,
// so the two paths can never drift apart.
function serializeClaim(doc) {
  return {
    claimed: true,
    trxId:     doc.trxId,
    platform:  doc.platform,
    amount:    doc.amount,
    expectedAmount: doc.expectedAmount,
    // Non-zero when the student paid more than the order came to. Surfaced so
    // the business can refund or credit it — the one thing that must not happen
    // is the surplus quietly disappearing.
    overpaidBy: doc.overpaidBy,
    orderRef:   doc.orderRef,
    idempotencyKey: doc.idempotencyKey,
    claimedAt:  doc.claimedAt,
    state:      doc.state,
  };
}

// Compare the payer's phone against the payment's sender.
//
// Rocket stores a masked account ("***515") rather than a full number, so an
// exact match is impossible there; fall back to comparing the trailing digits
// the mask does reveal. bKash and Nagad store the full number, which may or may
// not carry a country prefix, so compare on the last 10 digits either way.
function senderMatches(paymentSender, claimedPhone) {
  const a = String(paymentSender || '').replace(/\D/g, '');
  const b = String(claimedPhone  || '').replace(/\D/g, '');
  if (!a || !b) return false;
  const n = Math.min(a.length, b.length, 10);
  if (n < 3) return false;
  return a.slice(-n) === b.slice(-n);
}

// Find the payment by EXACT trxId. `platform` narrows it to one collection;
// without it all three are queried, which is still index-served — trxId carries
// a unique index in every payment collection.
//
// A trxId is unique per collection, not across them, so an unqualified lookup
// can in principle hit two platforms. That is refused rather than guessed at:
// picking one would mean claiming a payment the caller never named.
async function findPayment(trxId, platform) {
  if (platform) {
    const doc = await MODELS[platform].findOne({ trxId }).lean();
    return doc ? { doc, platform } : null;
  }

  const hits = [];
  for (const [name, Model] of Object.entries(MODELS)) {
    const doc = await Model.findOne({ trxId }).lean();
    if (doc) hits.push({ doc, platform: name });
  }
  if (hits.length > 1) {
    const e = new Error('ambiguous');
    e.ambiguous = hits.map((h) => h.platform);
    throw e;
  }
  return hits[0] || null;
}

// ---------------------------------------------------------------------------
// POST /v1/claims
//   { trxId, expectedAmount, idempotencyKey, orderRef?, platform?, senderPhone? }
// ---------------------------------------------------------------------------
router.post('/claims', requireClient, async (req, res, next) => {
  const body   = req.body ?? {};
  const client = req.client;

  // --- Input ---

  const trxId = String(body.trxId ?? '').trim();
  if (!trxId) return refuse(res, 400, 'invalid_request', { detail: 'trxId is required' });

  const idempotencyKey = String(body.idempotencyKey ?? '').trim();
  if (!idempotencyKey)
    return refuse(res, 400, 'invalid_request', { detail: 'idempotencyKey is required' });
  if (idempotencyKey.length > MAX_IDEM_KEY)
    return refuse(res, 400, 'invalid_request', { detail: 'idempotencyKey is too long' });

  const expectedAmount = Number(body.expectedAmount);
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0)
    return refuse(res, 400, 'invalid_request', { detail: 'expectedAmount must be a positive number' });

  const orderRef = String(body.orderRef ?? '').trim().slice(0, MAX_ORDER_REF);

  let platform = null;
  if (body.platform != null && body.platform !== '') {
    platform = String(body.platform).toLowerCase();
    if (!MODELS[platform])
      return refuse(res, 400, 'invalid_request', { detail: 'platform must be bkash, nagad or rocket' });
  }

  const senderPhone = String(body.senderPhone ?? '').trim();
  if (client.requireSenderMatch && !senderPhone)
    return refuse(res, 400, 'invalid_request', { detail: 'senderPhone is required for this client' });

  try {
    // --- Step 1: idempotent replay ---
    //
    // Before anything else, because the caller's own network retry must not
    // collide with the claim it already made. Without this, App A times out,
    // retries, hits 409 against its OWN claim, and concludes the payment was
    // stolen by the other business.
    const existing = await Claim.findOne({ clientId: client.clientId, idempotencyKey });
    if (existing) {
      // Same key, different transaction is a caller bug, not a retry. Replaying
      // here would tell the app that trx Y is claimed when trx X was.
      if (existing.trxId !== trxId) {
        log.warn('CLAIM', 'key_reuse', {
          clientId: client.clientId, trx: trxId, was: existing.trxId,
        });
        return refuse(res, 409, 'idempotency_key_reused', {
          detail: 'That idempotencyKey was used for a different transaction',
        });
      }
      return res.status(200).json(serializeClaim(existing));
    }

    // --- Step 2: find the payment ---

    let found;
    try {
      found = await findPayment(trxId, platform);
    } catch (err) {
      if (err.ambiguous) {
        return refuse(res, 409, 'ambiguous_trx', {
          detail: 'That transaction ID exists on more than one platform — send `platform`',
          platforms: err.ambiguous,
        });
      }
      throw err;
    }

    // Not found is "not yet", not "no". The student taps "I've paid" before the
    // forwarder delivers the SMS, routinely. A hard failure here turns paying
    // customers into support tickets, so the caller is told to poll.
    if (!found) {
      return refuse(res, 404, 'not_found', { retryable: true });
    }

    const payment = found.doc;

    // --- Step 3: policy ---

    // Underpayment is refused, and the payment stays claimable — the student
    // can top it up, or support can handle it, without the money being stuck.
    if (payment.amount < expectedAmount) {
      return refuse(res, 422, 'amount_mismatch', {
        expected: expectedAmount,
        actual:   payment.amount,
      });
    }

    // Overpayment claims, and records the surplus (step 5). Refusing it would
    // block a paying customer at checkout for having paid too much.
    const overpaidBy = payment.amount - expectedAmount;

    if (client.maxClaimAmount != null && payment.amount > client.maxClaimAmount) {
      return refuse(res, 422, 'exceeds_max_claim', {
        actual: payment.amount,
        max:    client.maxClaimAmount,
      });
    }

    if (client.claimWindowDays != null) {
      const ageMs = Date.now() - new Date(payment.dateReceived).getTime();
      if (ageMs > client.claimWindowDays * 86_400_000) {
        return refuse(res, 410, 'outside_claim_window', {
          dateReceived:    payment.dateReceived,
          claimWindowDays: client.claimWindowDays,
        });
      }
    }

    if (client.requireSenderMatch && !senderMatches(payment.sender, senderPhone)) {
      return refuse(res, 422, 'sender_mismatch');
    }

    // --- Step 4: the insert IS the lock ---
    //
    // A bare insert. Do NOT check whether a claim exists first: that is the
    // read-then-decide race this whole design exists to avoid, and two
    // concurrent checkouts would both see "unused" and both unlock.
    let claim;
    try {
      claim = await Claim.create({
        trxId,
        platform: found.platform,
        amount:   payment.amount,
        sender:   payment.sender,
        expectedAmount,
        overpaidBy,
        clientId: client.clientId,
        orderRef,
        idempotencyKey,
        state: 'claimed',
        claimedAt: new Date(),
      });
    } catch (err) {
      if (err.code !== 11000) throw err;

      // Which unique index rejected it decides the answer.
      const key = Object.keys(err.keyPattern || err.keyValue || {});

      // (clientId, idempotencyKey) — two of the caller's own retries raced past
      // step 1 together. The winner's row is the answer; replay it.
      if (key.includes('idempotencyKey')) {
        const winner = await Claim.findOne({ clientId: client.clientId, idempotencyKey });
        if (winner) return res.status(200).json(serializeClaim(winner));
      }

      // Otherwise the trxId partial-unique index: the payment is already spent.
      // The response says WHEN and nothing else — business B must not learn
      // that business A has this customer.
      const held = await Claim.findOne({ trxId, state: 'claimed' }).select('claimedAt').lean();
      log.warn('CLAIM', 'already', {
        platform: found.platform, amount: payment.amount, trx: trxId, by: client.clientId,
      });
      return refuse(res, 409, 'already_claimed', { claimedAt: held?.claimedAt ?? null });
    }

    log.info('CLAIM', 'claimed', {
      platform: found.platform,
      amount:   payment.amount,
      trx:      trxId,
      by:       client.clientId,
      order:    orderRef || undefined,
      over:     overpaidBy || undefined,
    });

    res.status(201).json(serializeClaim(claim));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
