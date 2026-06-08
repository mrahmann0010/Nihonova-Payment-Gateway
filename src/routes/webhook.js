// webhook.js — handles incoming SMS Gateway payloads.
//
// Route:  POST /webhooks/sms?token=<secret>
// Auth:   URL token verified by verifySignature middleware (applied in app.js).
//
// Payload from "Incoming SMS to URL Forwarder" Android app:
//   { from, text, sentStamp, receivedStamp, sim }
//
// Flow:
//   1. Check ALLOWED_SENDERS filter — return 200 immediately if not allowed
//      so the gateway doesn't retry irrelevant messages.
//   2. Detect the payment platform (bKash / Nagad / Rocket) and parse the text.
//   3. Only "received" (incoming money) messages are recognized; everything
//      else is acknowledged but discarded.
//   4. Save to the matching per-platform collection. trxId has a unique index
//      per collection, so it doubles as an idempotency key.

const express      = require('express');
const router       = express.Router();
const parsePayment = require('../services/parsePayment');

const Bkash  = require('../models/Bkash');
const Nagad  = require('../models/Nagad');
const Rocket = require('../models/Rocket');

// Maps a parsed platform name to its Mongoose model.
const MODELS = {
  bkash:  Bkash,
  nagad:  Nagad,
  rocket: Rocket,
};

// ALLOWED_SENDERS — comma-separated list of sender IDs/numbers to accept.
// Use * to accept SMS from any sender.
const ALLOWED_SENDERS = (process.env.ALLOWED_SENDERS || '*')
  .split(',')
  .map((s) => s.trim().toLowerCase());

const ACCEPT_ALL = ALLOWED_SENDERS.includes('*');

if (ACCEPT_ALL) {
  console.warn('[Webhook] ALLOWED_SENDERS=* — accepting SMS from any sender. Set a specific sender list in production.');
}

// ---------------------------------------------------------------------------
// POST /webhooks/sms
// ---------------------------------------------------------------------------
router.post('/sms', async (req, res) => {
  // The app sends: from, text, sentStamp (epoch ms), receivedStamp (epoch ms), sim
  const { from: sender, text, sim } = req.body;

  // sim arrives as a string (e.g. "1", "2", "SIM 1") — extract the first digit.
  const simNumber = sim != null ? parseInt(String(sim).replace(/\D/g, ''), 10) || null : null;

  // --- Step 1: sender filter ---
  if (!ACCEPT_ALL && !ALLOWED_SENDERS.includes((sender || '').toLowerCase())) {
    console.log(`[Webhook] Ignored sender not in allowlist: "${sender}"`);
    return res.status(200).json({ received: true, processed: false });
  }

  // --- Step 2: detect platform + parse ---
  const parsed = parsePayment(text || '');

  if (!parsed) {
    console.warn(`[Webhook] Unmatched SMS from "${sender}" — not stored (no known payment pattern)`);
    return res.status(200).json({ received: true, processed: false, reason: 'unmatched' });
  }

  const Model = MODELS[parsed.platform];
  if (!Model) {
    // Defensive — should never happen since parsePayment only emits known platforms.
    console.error(`[Webhook] No model for platform "${parsed.platform}"`);
    return res.status(200).json({ received: true, processed: false, reason: 'unknown_platform' });
  }

  // --- Step 3: save to the platform's collection ---
  try {
    const doc = new Model({
      amount:       parsed.amount,
      sender:       parsed.sender || sender,
      fee:          parsed.fee,
      balance:      parsed.balance,
      trxId:        parsed.trxId,
      dateReceived: parsed.dateReceived,
      timeReceived: parsed.rawTime,
      rawDate:      parsed.rawDate,
      simNumber,
      rawMessage:   text,
      ...(parsed.ref != null ? { ref: parsed.ref } : {}),
    });

    await doc.save();

    console.log(
      `[Webhook] Saved ${parsed.platform} — trxId: ${parsed.trxId}, amount: ${parsed.amount}, sender: ${doc.sender}`
    );

    return res.status(200).json({
      received: true,
      processed: true,
      platform: parsed.platform,
      trxId: parsed.trxId,
    });
  } catch (err) {
    // Duplicate trxId — already stored from a previous delivery attempt.
    // Return 200 so the gateway stops retrying.
    if (err.code === 11000) {
      console.log(`[Webhook] Duplicate trxId ignored — ${parsed.platform}/${parsed.trxId}`);
      return res.status(200).json({ received: true, processed: false, reason: 'duplicate' });
    }

    console.error('[Webhook] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
