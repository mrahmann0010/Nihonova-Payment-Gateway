// webhook.js — Express router that handles incoming SMS Gateway webhook payloads.
//
// Route:  POST /webhooks/sms?token=<secret>
// Auth:   URL token verified by verifySignature middleware (applied in server.js).
//
// Payload from "Incoming SMS to URL Forwarder" Android app:
//   { from, text, sentStamp, receivedStamp, sim }
//
// Flow:
//   1. Filter out non-bKash senders — return 200 immediately so the gateway
//      doesn't retry.
//   2. Parse the SMS text with bkashParser.
//   3. Save to MongoDB. Catch duplicate trxid (11000) and return 200.
//   4. If parsing fails save the raw message as "unmatched" so we never lose data.
//   5. On any unexpected error save with status "error" and return 500.

const express = require('express');
const router  = express.Router();
const Payment = require('../models/Payment');
const parseBkashSms = require('../services/bkashParser');

// ---------------------------------------------------------------------------
// ALLOWED_SENDERS — comma-separated list of sender IDs/numbers to accept.
// Use * to accept SMS from any sender.
// Example: "bKash,16247,01522112743" or "*"
// ---------------------------------------------------------------------------
const ALLOWED_SENDERS = (process.env.ALLOWED_SENDERS || '*')
  .split(',')
  .map((s) => s.trim().toLowerCase());

const ACCEPT_ALL = ALLOWED_SENDERS.includes('*');

// ---------------------------------------------------------------------------
// POST /webhooks/sms
// ---------------------------------------------------------------------------
router.post('/sms', async (req, res) => {
  // The app sends: from, text, sentStamp (epoch ms), receivedStamp (epoch ms), sim
  const { from: sender, text, sentStamp, receivedStamp, sim } = req.body;

  // Use the phone's reported receive time if available, otherwise server time.
  const receivedAt = receivedStamp ? new Date(Number(receivedStamp)) : new Date();

  // sim arrives as a string (e.g. "1", "2", "SIM 1") — extract the first digit.
  const simNumber = sim != null ? parseInt(String(sim).replace(/\D/g, ''), 10) || null : null;

  // --- Step 1: sender filter ---
  // If this SMS didn't come from a known bKash sender, acknowledge and discard.
  // We return 200 (not 4xx) because a non-200 response triggers the SMS Gateway
  // app's retry logic, which would spam us with the same irrelevant message.
  if (!ACCEPT_ALL && !ALLOWED_SENDERS.includes((sender || '').toLowerCase())) {
    console.log(`[Webhook] Ignored sender not in allowlist: "${sender}"`);
    return res.status(200).json({ received: true, processed: false });
  }

  // --- Step 2: parse SMS text ---
  const parsed = parseBkashSms(text || '');

  // --- Step 3 & 4: build document and save ---
  try {
    const doc = new Payment({
      rawMessage: text,
      sender,
      simNumber,
      receivedAt,
      // If parsing succeeded, spread all extracted fields and mark as parsed.
      // If it returned null, the spread is empty; we set status to "unmatched".
      ...(parsed
        ? { ...parsed, status: 'parsed' }
        : { status: 'unmatched' }),
    });

    await doc.save();

    if (parsed) {
      console.log(`[Webhook] Saved payment — trxid: ${parsed.trxid}, type: ${parsed.type}, amount: ${parsed.amount}`);
    } else {
      console.warn(`[Webhook] Unmatched SMS saved — sender: ${sender}`);
    }

    // Return 200 immediately. The gateway considers the delivery successful
    // and will not retry.
    return res.status(200).json({ received: true, processed: !!parsed });

  } catch (err) {
    // --- Duplicate trxid (MongoDB unique index violation) ---
    // Error code 11000 means this trxid is already in the collection.
    // This is expected with at-least-once delivery; return 200 so the gateway
    // stops retrying.
    if (err.code === 11000) {
      console.log(`[Webhook] Duplicate trxid ignored — ${parsed && parsed.trxid}`);
      return res.status(200).json({ received: true, processed: false, reason: 'duplicate' });
    }

    // --- Unexpected error ---
    // Attempt to save a minimal record with status "error" so we don't lose
    // the raw SMS. If this save also fails we log and fall through to 500.
    console.error(`[Webhook] Unexpected error — sender: ${sender}:`, err);
    try {
      await Payment.create({
        rawMessage: text,
        sender,
        simNumber,
        receivedAt,
        status: 'error',
      });
    } catch (saveErr) {
      console.error('[Webhook] Failed to save error record:', saveErr.message);
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
