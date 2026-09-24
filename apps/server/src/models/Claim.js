// Claim.js — the redemption ledger: "trx X was spent by app-a on order 8821".
//
// The payment collections are the *cash receipt* book — immutable, written by
// the SMS ingest, and they say only that money arrived. This is the *cash
// application* book, written by a consuming app at checkout. Splitting them is
// the whole feature: the gateway receives payments for several businesses on
// one MFS number, so a payment row alone cannot say who is allowed to spend it,
// and today every business can verify the same trxId forever.
//
// The unique index below IS the single-use rule. A claim is a write, and the
// insert is the lock: a caller never asks "is trx X free?", it asks to claim
// trx X. Insert succeeds → it owns the payment. Duplicate key → someone already
// does. Two concurrent checkouts resolve correctly with no transaction and no
// read-then-decide window. Same pattern routes/webhook.js already uses for
// ingest idempotency, applied to redemption instead.
//
// Nothing here is ever deleted. A refund or a mistaken claim moves `state` to
// 'released'; a delete would make the payment silently re-claimable and destroy
// the audit trail at exactly the moment it is needed.

const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    // --- What was spent ---

    trxId:    { type: String, required: true, trim: true },
    platform: { type: String, required: true, enum: ['bkash', 'nagad', 'rocket'] },

    // amount and sender are COPIED from the payment at claim time rather than
    // joined on read. The payment row is immutable so they can't drift, and a
    // copy means a claims report never has to fan out across three collections.
    amount: { type: Number, required: true },
    sender: { type: String, required: true },

    // What the payment was received as, when it differs from what the caller
    // expected. Underpayment is refused outright, so this is only ever ≥ 0:
    // the surplus a student overpaid. Recorded rather than pocketed silently,
    // so it can be refunded or credited later.
    expectedAmount: { type: Number, required: true },
    overpaidBy:     { type: Number, default: 0 },

    // --- Who spent it ---

    clientId: { type: String, required: true, trim: true },

    // The consuming app's own order id. Free-form: it is their key, not ours.
    orderRef: { type: String, default: '', trim: true },

    // Supplied by the caller, unique per client. Without this a caller's own
    // retry after a timeout collides with the claim it already made and the app
    // concludes the payment was stolen. See routes/v1.js step 2.
    idempotencyKey: { type: String, required: true, trim: true },

    // --- State ---

    state: { type: String, required: true, enum: ['claimed', 'released'], default: 'claimed' },

    claimedAt:     { type: Date, default: Date.now },
    releasedAt:    { type: Date, default: null },
    releaseReason: { type: String, default: '' },
  },
  { timestamps: true, collection: 'claims' }
);

// THE rule. Partial on state:'claimed' rather than a plain unique index, so a
// released claim frees the payment again — a plain unique index would fight the
// state machine and make release impossible without deleting history.
//
// Keyed on trxId alone, not platform+trxId. Payment trxIds are unique only
// *within* a collection, so in theory a bKash and a Nagad transaction could
// share an ID and the second would be refused as already claimed. That error
// leans the safe way — it can refuse a real payment, but it can never let one
// be spent twice — and routes/v1.js refuses an ambiguous cross-platform lookup
// up front for the same reason.
schema.index(
  { trxId: 1 },
  { unique: true, partialFilterExpression: { state: 'claimed' } }
);

// Replay protection, per caller. Unconditional (not partial): a released claim
// must still absorb the original attempt's retries rather than re-claiming.
schema.index({ clientId: 1, idempotencyKey: 1 }, { unique: true });

// Per-business history, newest first.
schema.index({ clientId: 1, claimedAt: -1 });

module.exports = mongoose.model('Claim', schema);
