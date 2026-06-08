// rocketParser.js — extracts structured data from a Rocket (DBBL) money-
// received SMS.
//
// Returns a normalized payment object, or null if the text isn't a Rocket
// received-money message.
//
// Example SMS (single line):
//   Tk99.00 received from A/C:***515 Fee:Tk0, Your A/C Balance: Tk1,145.85
//   TxnId:6606781284 Date:08-JUN-26 06:21:43 am. Download https://bit.ly/nexuspay
//
// Notes:
//   - The sender is a masked account number ("***515"), not a phone number.
//   - The date format is "dd-MON-yy hh:mm:ss am/pm" in BDT (UTC+6).

const { bdtToUtc, MONTHS, to24Hour } = require('./timeUtil');

function parseAmount(str) {
  return parseFloat(str.replace(/,/g, ''));
}

const ROCKET_REGEX = new RegExp(
  'Tk\\s*([\\d,]+(?:\\.\\d+)?)\\s+received from\\s+' +    // 1 amount
  'A\\/C:\\s*([*\\dxX]+)\\s+' +                            // 2 masked account
  'Fee:\\s*Tk\\s*([\\d,]+(?:\\.\\d+)?),?\\s*' +            // 3 fee
  'Your A\\/C Balance:\\s*Tk\\s*([\\d,]+(?:\\.\\d+)?)\\s+' + // 4 balance
  'TxnId:\\s*([A-Z0-9]+)\\s+' +                            // 5 txnId
  'Date:\\s*(\\d{2})-([A-Za-z]{3})-(\\d{2})\\s+' +         // 6 day, 7 mon, 8 yy
  '(\\d{1,2}):(\\d{2}):(\\d{2})\\s*(am|pm)',               // 9 h, 10 m, 11 s, 12 meridiem
  'i'
);

function parseRocketSms(text) {
  const match = text.match(ROCKET_REGEX);
  if (!match) return null;

  const [
    , amount, account, fee, balance, txnId,
    day, mon, yy, hh, mm, ss, meridiem,
  ] = match;

  const month = MONTHS[mon.toUpperCase()];
  if (!month) return null; // unrecognized month abbreviation

  const year = 2000 + Number(yy);
  const hour = to24Hour(Number(hh), meridiem);
  const rawTime = `${hh}:${mm}:${ss} ${meridiem.toLowerCase()}`;

  return {
    platform: 'rocket',
    amount: parseAmount(amount),
    sender: account, // masked account, e.g. "***515"
    fee: parseAmount(fee),
    balance: parseAmount(balance),
    trxId: txnId.toUpperCase(),
    dateReceived: bdtToUtc(year, month, Number(day), hour, Number(mm), Number(ss)),
    rawDate: `${day}-${mon.toUpperCase()}-${yy}`,
    rawTime,
  };
}

module.exports = parseRocketSms;
