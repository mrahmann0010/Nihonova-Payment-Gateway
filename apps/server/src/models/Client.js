// Client.js — a registered consuming app (a business that verifies payments
// against this gateway).
//
// The gateway stores payments on one receiving number shared by several
// businesses, so a payment is ambiguous on its own: nothing in an SMS says
// which business the money was for. A client row is the missing identity —
// it gives every incoming verification call a *who*, which is what later lets
// a payment be spent exactly once, by exactly one business.
//
// Three groups of fields, deliberately kept apart:
//   1. Business    — stable. Name, owner, notes.
//   2. Policy      — the blast radius if this client's secret leaks.
//   3. Credential  — rotates. Hashes only; plaintext is never stored or
//                    returned, not even at creation (see routes/clients.js).
// Splitting credentials into their own collection later (one business, several
// keys) is then a move, not a rewrite.

const mongoose = require('mongoose');

// Slug used in the Authorization header and stamped onto every future claim.
// Lowercase kebab so it reads the same in a header, a log line and a URL.
const CLIENT_ID_RE = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

const schema = new mongoose.Schema(
  {
    // --- 1. Business identity ---

    // Immutable once created: it is the public name of the credential, and
    // renaming it would orphan every claim that recorded the old value.
    clientId: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [CLIENT_ID_RE, 'clientId must be lowercase letters, digits and hyphens'],
      immutable: true,
    },

    name: { type: String, required: true, trim: true },

    // Lockout switch. Never delete a client — historical claims reference it.
    active: { type: Boolean, default: true },

    // --- 2. Ownership — who to call when this client's key leaks at 11pm ---
    ownerName:  { type: String, trim: true, default: '' },
    ownerEmail: { type: String, trim: true, lowercase: true, default: '' },
    ownerPhone: { type: String, trim: true, default: '' },
    notes:      { type: String, trim: true, default: '' },

    // --- 3. Policy — the limits that bound a leaked secret ---

    // Largest single payment this client may ever claim. Null = no ceiling.
    maxClaimAmount: { type: Number, default: null, min: 1 },

    // How old a payment may be and still be claimable. Without a bound, an
    // unclaimed payment stays redeemable forever by anyone who learns its
    // trxId. Null = no bound.
    claimWindowDays: { type: Number, default: null, min: 1 },

    // When true, a claim must carry the payer's phone and it must match the
    // payment's sender. Defends against a student pasting a trxId screenshotted
    // from a group chat. Off by default: a checkout that doesn't collect the
    // payer's number would break the moment this turned on for everyone.
    requireSenderMatch: { type: Boolean, default: false },

    // --- 4. Credential ---
    //
    // SHA-256, not bcrypt. bcrypt is slow on purpose because human passwords
    // are low-entropy and guessable; these secrets are held to a hard entropy
    // floor (services/clientSecret.js) so there is nothing to slow down — and
    // this hash is checked on every single checkout, where latency is real.
    secretHash:  { type: String, required: true, select: false },
    secretSetAt: { type: Date, default: Date.now },

    // Rotation overlap. A new secret is issued while the old one stays valid
    // until `previousExpiresAt`, so the consuming app can be redeployed without
    // a window where checkout is down. Cleared by the revoke-previous action.
    previousSecretHash: { type: String, default: null, select: false },
    previousExpiresAt:  { type: Date, default: null },

    // Superseded hashes, newest first, capped at PAST_SECRET_LIMIT. Only ever
    // compared against — never authenticates anything. Exists so a rotation
    // can refuse to go back to a secret that was already retired.
    pastSecretHashes: { type: [String], default: [], select: false },

    // --- 5. Audit ---
    rotatedAt: { type: Date, default: null },
    // Written on each successful authentication. This is how you confirm a
    // rotation actually took effect and spot a client that has gone silent.
    lastUsedAt: { type: Date, default: null },
    createdBy:  { type: String, default: '' },
    updatedBy:  { type: String, default: '' },
  },
  { timestamps: true, collection: 'clients' }
);

// Cross-client duplicate detection: refuse a secret already in use elsewhere,
// which catches the actual mistake — pasting one value into both businesses.
schema.index({ secretHash: 1 });

module.exports = mongoose.model('Client', schema);
module.exports.CLIENT_ID_RE = CLIENT_ID_RE;
module.exports.PAST_SECRET_LIMIT = 10;
