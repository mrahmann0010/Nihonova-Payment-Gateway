// bkashParser.js — pure function that extracts structured payment data from
// a raw bKash SMS string using regular expressions.
//
// Returns a plain object with all parsed fields, or null if the text doesn't
// match any known bKash SMS pattern.
//
// Three patterns are handled:
//   1. Send Money received  — "You have received Tk <amount> from <phone>..."
//   2. Cash In deposit      — "You have received a deposit of BDT <amount> from ..."
//   3. Merchant / Pay Bill  — "Payment Tk <amount> to <merchant> from <phone>..."

const { bdtToUtc } = require('./timeUtil');

// ---------------------------------------------------------------------------
// Helper — strip commas from number strings like "1,200.00" → "1200.00"
// then parse to float. Returns NaN if the value is not a valid number.
// ---------------------------------------------------------------------------
function parseAmount(str) {
  return parseFloat(str.replace(/,/g, ''));
}

// ---------------------------------------------------------------------------
// Helper — convert the "dd/mm/yyyy hh:mm" timestamp found in bKash SMS text
// into a JavaScript Date object (UTC). bKash prints local BDT (UTC+6) time.
// ---------------------------------------------------------------------------
function parseBkashDate(dateStr, timeStr) {
  // dateStr e.g. "08/06/2026", timeStr e.g. "14:32"
  const [day, month, year] = dateStr.split('/').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  return bdtToUtc(year, month, day, hour, minute);
}

// ---------------------------------------------------------------------------
// Common sub-patterns reused across multiple regexes:
//   AMOUNT  — numeric value with optional commas and decimal part
//   TRXID   — alphanumeric transaction ID (6–12 characters)
//   PHONE   — 11-digit Bangladeshi number starting with 01
//   DATE    — dd/mm/yyyy
//   TIME    — hh:mm
// ---------------------------------------------------------------------------
const AMOUNT = '([\\d,]+(?:\\.\\d+)?)';
const TRXID  = '([A-Z0-9]{6,12})';
const PHONE  = '(01[0-9]{9})';
const DATE   = '(\\d{2}/\\d{2}/\\d{4})';
const TIME   = '(\\d{2}:\\d{2})';

// ---------------------------------------------------------------------------
// Pattern 1 — Send Money received
// Example:
//   "You have received Tk 500.00 from 01712345678. Fee Tk 0.00.
//    Balance Tk 1,200.00. TrxID AB1234CDEF at 08/06/2026 14:32"
// ---------------------------------------------------------------------------
const RECEIVED_REGEX = new RegExp(
  `You have received Tk ${AMOUNT} from ${PHONE}\\.\\s*` +
  `Fee (?:Tk|BDT) ${AMOUNT}\\.\\s*` +
  `Balance (?:Tk|BDT) ${AMOUNT}\\.\\s*` +
  `TrxID ${TRXID} at ${DATE} ${TIME}`,
  'i'
);

// ---------------------------------------------------------------------------
// Pattern 2 — Cash In deposit
// Example:
//   "You have received a deposit of BDT 30,000 from CZB
//    Fee BDT 0.00. Balance BDT 200,000. TrxID XXXXXXXXXX at 08/06/2026 14:32"
//
// Note: Cash In doesn't include a sender phone number in the SMS; the
// sender field is a branch/agent code like "CZB". We skip senderNumber here.
// ---------------------------------------------------------------------------
const DEPOSIT_REGEX = new RegExp(
  `You have received a deposit of (?:Tk|BDT) ${AMOUNT} from [^.]+\\.?\\s*` +
  `Fee (?:Tk|BDT) ${AMOUNT}\\.\\s*` +
  `Balance (?:Tk|BDT) ${AMOUNT}\\.\\s*` +
  `TrxID ${TRXID} at ${DATE} ${TIME}`,
  'i'
);

// ---------------------------------------------------------------------------
// Pattern 3 — Merchant payment / Pay Bill outgoing
// Example:
//   "Payment Tk 1,000.00 to Some Merchant from 01712345678.
//    Fee Tk 0.00. Balance Tk 200.00. TrxID XY9876GHIJ at 08/06/2026 15:10"
//
// The merchant name between "to" and "from" is variable length so we use a
// lazy wildcard that stops at the first " from ".
// ---------------------------------------------------------------------------
const PAYMENT_REGEX = new RegExp(
  `Payment (?:Tk|BDT) ${AMOUNT} to .+? from ${PHONE}\\.\\s*` +
  `Fee (?:Tk|BDT) ${AMOUNT}\\.\\s*` +
  `Balance (?:Tk|BDT) ${AMOUNT}\\.\\s*` +
  `TrxID ${TRXID} at ${DATE} ${TIME}`,
  'i'
);

// ---------------------------------------------------------------------------
// Pattern 4 — iBanking deposit
// Example:
//   "You have received deposit from iBanking of Tk 99.00 from Prime Bank.
//    Fee Tk 0.00. Balance Tk 23,324.44. TrxID DF844EE7SM at 08/06/2026 21:41"
//
// The bank name after "from" is variable; we stop at the period.
// No sender phone number is present in this format.
// ---------------------------------------------------------------------------
const IBANKING_REGEX = new RegExp(
  `You have received deposit from iBanking of (?:Tk|BDT) ${AMOUNT} from [^.]+\\.\\s*` +
  `Fee (?:Tk|BDT) ${AMOUNT}\\.\\s*` +
  `Balance (?:Tk|BDT) ${AMOUNT}\\.\\s*` +
  `TrxID ${TRXID} at ${DATE} ${TIME}`,
  'i'
);

// ---------------------------------------------------------------------------
// Main export — parseBkashSms(text)
//
// Tries each pattern in turn and returns a structured object on first match,
// or null if none match.
// ---------------------------------------------------------------------------
function parseBkashSms(text) {
  let match;

  // --- Pattern 1: Send Money received ---
  match = text.match(RECEIVED_REGEX);
  if (match) {
    // Capture groups: 1=amount 2=phone 3=fee 4=balance 5=trxid 6=date 7=time
    const [, amount, senderNumber, fee, balance, trxid, date, time] = match;
    return {
      type: 'received',
      amount: parseAmount(amount),
      senderNumber,
      fee: parseAmount(fee),
      balance: parseAmount(balance),
      trxid: trxid.toUpperCase(),
      bkashTimestamp: parseBkashDate(date, time),
      rawDate: date,
      rawTime: time,
    };
  }

  // --- Pattern 2: Cash In deposit ---
  match = text.match(DEPOSIT_REGEX);
  if (match) {
    // Capture groups: 1=amount 2=fee 3=balance 4=trxid 5=date 6=time
    const [, amount, fee, balance, trxid, date, time] = match;
    return {
      type: 'deposit',
      amount: parseAmount(amount),
      senderNumber: null,
      fee: parseAmount(fee),
      balance: parseAmount(balance),
      trxid: trxid.toUpperCase(),
      bkashTimestamp: parseBkashDate(date, time),
      rawDate: date,
      rawTime: time,
    };
  }

  // --- Pattern 3: Merchant payment ---
  match = text.match(PAYMENT_REGEX);
  if (match) {
    // Capture groups: 1=amount 2=phone 3=fee 4=balance 5=trxid 6=date 7=time
    const [, amount, senderNumber, fee, balance, trxid, date, time] = match;
    return {
      type: 'payment',
      amount: parseAmount(amount),
      senderNumber,
      fee: parseAmount(fee),
      balance: parseAmount(balance),
      trxid: trxid.toUpperCase(),
      bkashTimestamp: parseBkashDate(date, time),
      rawDate: date,
      rawTime: time,
    };
  }

  // --- Pattern 4: iBanking deposit ---
  match = text.match(IBANKING_REGEX);
  if (match) {
    // Capture groups: 1=amount 2=fee 3=balance 4=trxid 5=date 6=time
    const [, amount, fee, balance, trxid, date, time] = match;
    return {
      type: 'ibanking_deposit',
      amount: parseAmount(amount),
      senderNumber: null,
      fee: parseAmount(fee),
      balance: parseAmount(balance),
      trxid: trxid.toUpperCase(),
      bkashTimestamp: parseBkashDate(date, time),
      rawDate: date,
      rawTime: time,
    };
  }

  // No pattern matched — caller decides what to do (save as unmatched).
  return null;
}

module.exports = parseBkashSms;
