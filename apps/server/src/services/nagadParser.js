// nagadParser.js — extracts structured data from a Nagad "Money Received" SMS.
//
// Returns a normalized payment object, or null if the text isn't a Nagad
// received-money message. Only incoming money is recognized; any other Nagad
// SMS shape returns null and is acknowledged-but-discarded by the webhook.
//
// Example SMS (multi-line):
//   Money Received.
//   Amount: Tk 99.00
//   Sender: 01634358056
//   Ref: Saom
//   TxnID: 75HKUOBF
//   Balance: Tk 1289.43
//   08/06/2026 19:00

const { bdtToUtc } = require('./timeUtil');

function parseAmount(str) {
  return parseFloat(str.replace(/,/g, ''));
}

// Fields are newline-separated in the real SMS, but we use \s* between them so
// the pattern also matches if the gateway collapses whitespace. The "Ref:"
// line is optional. Trailing date/time is "dd/mm/yyyy hh:mm" in BDT (UTC+6).
const NAGAD_REGEX = new RegExp(
  'Money Received\\.?\\s*' +
  'Amount:\\s*Tk\\s*([\\d,]+(?:\\.\\d+)?)\\s*' +     // 1 amount
  'Sender:\\s*(01[0-9]{9})\\s*' +                    // 2 sender phone
  '(?:Ref:\\s*([^\\n]*?)\\s*)?' +                    // 3 ref (optional)
  'TxnID:\\s*([A-Z0-9]+)\\s*' +                      // 4 txnId
  'Balance:\\s*Tk\\s*([\\d,]+(?:\\.\\d+)?)\\s*' +    // 5 balance
  '(\\d{2}/\\d{2}/\\d{4})\\s+(\\d{2}:\\d{2})',       // 6 date, 7 time
  'i'
);

function parseNagadSms(text) {
  const match = text.match(NAGAD_REGEX);
  if (!match) return null;

  const [, amount, sender, ref, txnId, balance, date, time] = match;
  const [day, month, year] = date.split('/').map(Number);
  const [hour, minute] = time.split(':').map(Number);

  return {
    platform: 'nagad',
    amount: parseAmount(amount),
    sender,
    fee: 0, // Nagad received-money SMS carries no fee
    balance: parseAmount(balance),
    trxId: txnId.toUpperCase(),
    ref: ref ? ref.trim() : null,
    dateReceived: bdtToUtc(year, month, day, hour, minute),
    rawDate: date,
    rawTime: time,
  };
}

module.exports = parseNagadSms;
