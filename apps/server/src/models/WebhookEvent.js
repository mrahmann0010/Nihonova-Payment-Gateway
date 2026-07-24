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
      index: true,
    },
    platform:   { type: String, default: null },
    sender:     { type: String, default: null },
    rawMessage: { type: String, default: null },
    error:      { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'webhook_events' }
);

schema.index({ createdAt: -1 });

module.exports = mongoose.model('WebhookEvent', schema);
