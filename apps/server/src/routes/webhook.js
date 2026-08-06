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
const log          = require('../services/logger');

const Bkash        = require('../models/Bkash');
const Nagad        = require('../models/Nagad');
const Rocket       = require('../models/Rocket');
const WebhookEvent = require('../models/WebhookEvent');

// Maps a parsed platform name to its Mongoose model.
const MODELS = {
  bkash:  Bkash,
  nagad:  Nagad,
  rocket: Rocket,
};

// Fire-and-forget ingestion-health log — must never throw or delay the
// webhook response, so a logging hiccup can't turn into a dropped payment.
function logEvent(reason, fields) {
  WebhookEvent.create({ reason, ...fields }).catch((err) => {
    log.error('WEBHOOK', 'log_fail', { error: err.message });
  });
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
  const knownSenders = [
    process.env.BKASH_SENDER,
    process.env.NAGAD_SENDER,
    process.env.ROCKET_SENDER,
  ].filter(Boolean).map((s) => s.trim().toLowerCase());

  const senderLower = (sender || '').toLowerCase();
  if (knownSenders.length > 0 && !knownSenders.includes(senderLower)) {
    log.warn('WEBHOOK', 'unknown', { from: sender || '?' });
    logEvent('unknown_sender', { sender });
    return res.status(200).json({ received: true, processed: false });
  }

  // --- Step 2: detect platform + parse ---
  const parsed = parsePayment(text || '');

  if (!parsed) {
    log.warn('WEBHOOK', 'unmatched', { from: sender || '?', len: (text || '').length });
    logEvent('unmatched', { sender, rawMessage: (text || '').slice(0, 300) });
    return res.status(200).json({ received: true, processed: false, reason: 'unmatched' });
  }

  const Model = MODELS[parsed.platform];
  if (!Model) {
    // Defensive — should never happen since parsePayment only emits known platforms.
    log.error('WEBHOOK', 'no_model', { platform: parsed.platform, trx: parsed.trxId });
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

    log.info('WEBHOOK', 'saved', {
      platform: parsed.platform,
      amount:   parsed.amount,
      trx:      parsed.trxId,
      from:     doc.sender,
      sim:      simNumber,
      at:       parsed.rawTime,
      fee:      parsed.fee || null,
    });

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
      log.warn('WEBHOOK', 'duplicate', {
        platform: parsed.platform,
        amount:   parsed.amount,
        trx:      parsed.trxId,
        from:     parsed.sender || sender,
      });
      logEvent('duplicate', { platform: parsed.platform, sender: parsed.sender || sender });
      return res.status(200).json({ received: true, processed: false, reason: 'duplicate' });
    }

    log.error('WEBHOOK', 'error', {
      platform: parsed.platform,
      amount:   parsed.amount,
      trx:      parsed.trxId,
      from:     parsed.sender || sender,
      error:    err.message,
    });
    logEvent('error', { platform: parsed.platform, sender: parsed.sender || sender, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
