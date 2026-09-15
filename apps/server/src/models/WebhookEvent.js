// WebhookEvent.js — ingestion-health log.
//
// The webhook route only console-logs unmatched/duplicate/unknown-sender/error
// cases; nothing about them was ever persisted. This collection captures those
// events going forward so the admin "Health" page can show real pipeline-trust
// signals instead of just assuming every incoming SMS made it into the DB.

const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    reason: {
      type: String,
      enum: ['unmatched', 'duplicate', 'unknown_sender', 'error'],
      required: true,
    },
    platform:   { type: String, default: null },
    sender:     { type: String, default: null },
    rawMessage: { type: String, default: null },
    error:      { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'webhook_events' }
);

// Health only reads the last 7 days plus the latest 50 events, so older rows are
// dead weight — the TTL monitor deletes them after 90 days.
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('WebhookEvent', schema);
