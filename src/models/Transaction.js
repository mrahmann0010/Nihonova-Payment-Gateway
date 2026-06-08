const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    // "received" | "deposit" | "payment" — set by the SMS parser.
    type: {
      type: String,
      enum: ["received", "deposit", "payment"],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    sender: {
      type: String,
      required: true,
    },

    balance: {
      type: Number,
      required: true,
    },

    // Idempotency key — unique index prevents storing the same transaction
    // twice even when the SMS gateway retries a delivery.
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

    // Local Bangladesh time string ("HH:MM") printed inside the SMS.
    // Stored separately from dateReceived so the original time is never lost
    // to UTC conversion.
    timeReceived: {
      type: String,
      required: true,
    },

    // SIM slot the gateway received the SMS on (1, 2, …). Null when unknown.
    simNumber: {
      type: Number,
      default: null,
    },

    paymentMethod: {
      type: String,
      default: "bkash",
    },

    rawMessage: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Transaction", transactionSchema);
