// webhook.js — handles incoming SMS Gateway payloads.
//
// Route:  POST /webhooks/sms?token=<secret>
// Auth:   URL token verified by verifySignature middleware (applied in server.js).
//
// Payload from "Incoming SMS to URL Forwarder" Android app:
//   { from, text, sentStamp, receivedStamp, sim }
//
// Flow:
//   1. Check ALLOWED_SENDERS filter — return 200 immediately if not allowed
//      so the gateway doesn't retry irrelevant messages.
//   2. Try to parse the SMS text as a bKash transaction.
//   3. Only "received" type messages (Send Money received) are stored.
//      Deposits and outgoing payments are acknowledged but discarded.
//   4. If parsed and type=received → save to Transaction (trxId unique index = idempotency key).
//   5. If not parsed → log and acknowledge; nothing saved.

const express     = require('express');
const router      = express.Router();
const Transaction = require('../models/Transaction');
const parseBkashSms = require('../services/bkashParser');

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
  const { from: sender, text, receivedStamp, sim } = req.body;

  // sim arrives as a string (e.g. "1", "2", "SIM 1") — extract the first digit.
  const simNumber = sim != null ? parseInt(String(sim).replace(/\D/g, ''), 10) || null : null;

  // --- Step 1: sender filter ---
  if (!ACCEPT_ALL && !ALLOWED_SENDERS.includes((sender || '').toLowerCase())) {
    console.log(`[Webhook] Ignored sender not in allowlist: "${sender}"`);
    return res.status(200).json({ received: true, processed: false });
  }

  // --- Step 2: parse SMS text ---
  const parsed = parseBkashSms(text || '');

  if (!parsed) {
    console.warn(`[Webhook] Unmatched SMS from "${sender}" — not stored (no bKash pattern found)`);
    return res.status(200).json({ received: true, processed: false, reason: 'unmatched' });
  }

  // Only record incoming payments (Send Money received).
  // Deposits and outgoing payments are silently acknowledged but not stored.
  if (parsed.type !== 'received') {
    console.log(`[Webhook] Skipped non-received SMS type "${parsed.type}" from "${sender}"`);
    return res.status(200).json({ received: true, processed: false, reason: 'not_received_type' });
  }

  // --- Step 3: save to Transaction ---
  try {
    const doc = new Transaction({
      type:          parsed.type,
      amount:        parsed.amount,
      sender:        parsed.senderNumber || sender,
      balance:       parsed.balance,
      trxId:         parsed.trxid,
      dateReceived:  parsed.bkashTimestamp,
      timeReceived:  parsed.rawTime,
      simNumber,
      paymentMethod: 'bkash',
      rawMessage:    text,
    });

    await doc.save();

    console.log(
      `[Webhook] Saved — trxId: ${parsed.trxid}, amount: ${parsed.amount}, sender: ${doc.sender}`
    );

    return res.status(200).json({ received: true, processed: true, trxId: parsed.trxid });

  } catch (err) {
    // Duplicate trxId — already stored from a previous delivery attempt.
    // Return 200 so the gateway stops retrying.
    if (err.code === 11000) {
      console.log(`[Webhook] Duplicate trxId ignored — ${parsed.trxid}`);
      return res.status(200).json({ received: true, processed: false, reason: 'duplicate' });
    }

    console.error('[Webhook] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
