// Payment.js — Mongoose model for bKash payment records.
// Each document represents one bKash SMS notification received via webhook.
// The trxid field acts as an idempotency key: a unique index prevents us from
// storing the same transaction twice even if the webhook is delivered more than once.

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    // Transaction ID extracted from the SMS body (e.g. "AB1234CDEF").
    // Unique index means Mongoose will throw error code 11000 on a duplicate
    // insert, which the webhook handler catches and returns 200 OK.
    trxid: {
      type: String,
      unique: true,
      sparse: true, // allow null/undefined for unmatched messages that have no trxid
    },

    // Amount in BDT as a plain number (commas stripped during parsing).
    amount: { type: Number },

    // Transaction fee; defaults to 0 because bKash often sends "Fee Tk 0.00".
    fee: { type: Number, default: 0 },

    // Account balance remaining after the transaction.
    balance: { type: Number },

    // The 11-digit Bangladeshi mobile number of the sender (01XXXXXXXXX).
    senderNumber: { type: String },

    // What kind of bKash transaction this is.
    type: {
      type: String,
      enum: ['received', 'deposit', 'payment'],
    },

    // The date/time printed inside the SMS text, converted to a JS Date.
    // Stored separately from receivedAt so queries can filter by when the
    // transaction actually happened vs. when we received the webhook.
    bkashTimestamp: { type: Date },

    // The full original SMS text. Kept verbatim so we can re-parse later
    // if we improve the regex, or debug edge cases.
    rawMessage: { type: String, required: true },

    // The sender ID string from the webhook payload (e.g. "bKash", "16247").
    sender: { type: String },

    // Optional device identifier forwarded by the SMS Gateway app.
    deviceId: { type: String },

    // Which SIM card on the Android device received the SMS (1 or 2).
    simNumber: { type: Number },

    // Processing outcome:
    //   parsed     — all fields extracted successfully
    //   unmatched  — SMS didn't match any known bKash pattern; raw data saved
    //   error      — an unexpected exception occurred during processing
    status: {
      type: String,
      enum: ['parsed', 'unmatched', 'error'],
      default: 'parsed',
    },

    // Wall-clock time the webhook request arrived at our server.
    // Distinct from createdAt (Mongoose auto-field) which reflects DB insert time.
    receivedAt: { type: Date },
  },
  {
    // Automatically manages createdAt and updatedAt fields on every document.
    timestamps: true,

    // Name the collection explicitly so it doesn't pluralise unexpectedly.
    collection: 'payments',
  }
);

module.exports = mongoose.model('Payment', paymentSchema);
