// clientAuth.js — authenticate a consuming app by its client credential.
//
// Not mounted anywhere yet: the claim endpoint that will call it lands with
// the claims feature. It lives here now because the rotation *rule* is part of
// what a credential means, and that rule only exists as code in one place —
// during a rotation's grace window BOTH the new and the previous secret
// authenticate, which is what lets an app be redeployed without downtime.
//
// Credential format on the wire:
//   Authorization: Bearer <clientId>.<secret>
// One dot separates them; the secret itself is base64url or admin-chosen and
// may contain dots, so only the FIRST dot is the separator.

const Client = require('../models/Client');
const { hashSecret, hashesEqual } = require('./clientSecret');

// Split "<clientId>.<secret>" without letting dots inside the secret confuse it.
function parseCredential(raw) {
  if (typeof raw !== 'string') return null;
  const dot = raw.indexOf('.');
  if (dot <= 0 || dot === raw.length - 1) return null;
  return { clientId: raw.slice(0, dot).toLowerCase(), secret: raw.slice(dot + 1) };
}

// Resolve a Bearer credential to a client, or a reason it was refused.
// Every failure returns the same shape so a caller can't tell an unknown
// client from a wrong secret by the response.
async function authenticate(bearer) {
  const parsed = parseCredential(bearer);
  if (!parsed) return { ok: false, reason: 'malformed' };

  const client = await Client.findOne({ clientId: parsed.clientId })
    .select('+secretHash +previousSecretHash')
    .exec();
  if (!client) return { ok: false, reason: 'unknown' };
  if (!client.active) return { ok: false, reason: 'inactive' };

  const presented = hashSecret(parsed.secret);

  let matched = hashesEqual(presented, client.secretHash) ? 'current' : null;

  // The previous secret stays valid only until its grace window closes.
  if (
    !matched &&
    client.previousSecretHash &&
    client.previousExpiresAt &&
    client.previousExpiresAt > new Date() &&
    hashesEqual(presented, client.previousSecretHash)
  ) {
    matched = 'previous';
  }

  if (!matched) return { ok: false, reason: 'bad_secret' };

  // Fire-and-forget: a bookkeeping write must never fail or slow a payment.
  Client.updateOne({ _id: client._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});

  return { ok: true, client, usedSecret: matched };
}

module.exports = { authenticate, parseCredential };
