// timeUtil.js — shared date/time helpers for SMS parsers.
//
// All three providers (bKash, Nagad, Rocket) print timestamps in Bangladesh
// local time (UTC+6). We convert to UTC so the Date stored in MongoDB is
// timezone-neutral, while the raw local date/time strings are kept separately
// on each document so the original wording is never lost.

// ---------------------------------------------------------------------------
// bdtToUtc — build a UTC Date from Bangladesh-local calendar parts.
// Subtracts the +6h offset so the resulting Date represents the same instant.
// ---------------------------------------------------------------------------
function bdtToUtc(year, month, day, hour, minute, second = 0) {
  // Month is 1-indexed here; Date.UTC expects 0-indexed.
  const bdtMs = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  return new Date(bdtMs - 6 * 60 * 60 * 1000); // strip UTC+6 offset
}

// ---------------------------------------------------------------------------
// strTo12hMonth — month name → 1-indexed month number.
// Rocket prints dates as "08-JUN-26", so we map the 3-letter month name.
// ---------------------------------------------------------------------------
const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

// ---------------------------------------------------------------------------
// to24Hour — convert a 12-hour clock + am/pm marker to 24-hour hours.
//   12:xx am → 00:xx   |   12:xx pm → 12:xx   |   1–11 pm → 13–23
// ---------------------------------------------------------------------------
function to24Hour(hour, meridiem) {
  const m = meridiem.toLowerCase();
  if (m === 'am') return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12; // pm
}

module.exports = { bdtToUtc, MONTHS, to24Hour };
