// parsePayment.js — platform dispatcher.
//
// Given a raw SMS string, detects which provider sent it (bKash, Nagad, or
// Rocket) and returns a normalized received-payment object, or null if the
// text isn't a recognized incoming-payment message from any provider.
//
// Normalized shape (consumed by the webhook route):
//   {
//     platform: 'bkash' | 'nagad' | 'rocket',
//     amount, sender, fee, balance, trxId,
//     dateReceived (Date), rawDate, rawTime,
//     ref?           // Nagad only
//   }
//
// Only INCOMING money is stored. For bKash, the existing parser also matches
// deposits and outgoing payments, so we explicitly keep only type 'received'.

const parseBkashSms  = require('./bkashParser');
const parseNagadSms  = require('./nagadParser');
const parseRocketSms = require('./rocketParser');

function parsePayment(text) {
  // --- bKash ---
  const bkash = parseBkashSms(text);
  if (bkash && bkash.type === 'received') {
    return {
      platform: 'bkash',
      amount: bkash.amount,
      sender: bkash.senderNumber,
      fee: bkash.fee,
      balance: bkash.balance,
      trxId: bkash.trxid,
      dateReceived: bkash.bkashTimestamp,
      rawDate: bkash.rawDate,
      rawTime: bkash.rawTime,
    };
  }

  // --- Nagad ---
  const nagad = parseNagadSms(text);
  if (nagad) return nagad;

  // --- Rocket ---
  const rocket = parseRocketSms(text);
  if (rocket) return rocket;

  return null;
}

module.exports = parsePayment;
