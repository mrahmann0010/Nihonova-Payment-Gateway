// createPaymentModel.js — factory that builds a per-provider Mongoose model.
//
// bKash, Nagad, and Rocket each get their OWN collection so received payments
// are stored separately per platform. They share the same base shape; the
// factory keeps that shape in one place and lets each provider add fields
// (e.g. Nagad's "ref").

const mongoose = require('mongoose');

function createPaymentModel(modelName, collectionName, extraFields = {}) {
  const schema = new mongoose.Schema(
    {
      amount: {
        type: Number,
        required: true,
      },

      // Phone number (bKash/Nagad) or masked account (Rocket, e.g. "***515").
      sender: {
        type: String,
        required: true,
      },

      fee: {
        type: Number,
        default: 0,
      },

      balance: {
        type: Number,
        required: true,
      },

      // Idempotency key — unique index prevents storing the same transaction
      // twice when the SMS gateway retries a delivery. Scoped per collection,
      // so identical-looking IDs across providers never collide.
      trxId: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      dateReceived: {
        type: Date,
        required: true,
        index: true,
      },

      // Original local-time string printed inside the SMS, kept verbatim so the
      // wording is never lost to UTC conversion.
      timeReceived: {
        type: String,
      },

      // Original local-date string printed inside the SMS.
      rawDate: {
        type: String,
      },

      // SIM slot the gateway received the SMS on (1, 2, …). Null when unknown.
      simNumber: {
        type: Number,
        default: null,
      },

      rawMessage: {
        type: String,
      },

      ...extraFields,
    },
    {
      timestamps: true,
      collection: collectionName,
    }
  );

  return mongoose.model(modelName, schema);
}

module.exports = createPaymentModel;
