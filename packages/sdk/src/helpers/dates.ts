/* --------------------------------------------------------------------------
   Timestamps from the gateway, read strictly.

   `new Date(string)` accepts a dozen formats and reads a timestamp without a
   zone as local time, so two runtimes can disagree on the same string. The
   gateway only ever sends ISO 8601 with a zone; anything else is null, in
   every SDK, by the same rule (vectors/helpers.json → parseIsoDate).
   -------------------------------------------------------------------------- */

const ISO =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.([0-9]+))?)?(Z|[+-][0-9]{2}:[0-9]{2})$/;

/** Millisecond precision; extra fraction digits are cut, not rounded. */
export function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = ISO.exec(value);
  if (!m) return null;

  const [year, month, day, hour, minute] = [m[1], m[2], m[3], m[4], m[5]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const ms = m[7] === undefined ? 0 : Number(m[7].slice(0, 3).padEnd(3, "0"));

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  let offsetMinutes = 0;
  if (m[8] !== "Z") {
    const sign = m[8]!.startsWith("-") ? -1 : 1;
    const oh = Number(m[8]!.slice(1, 3));
    const om = Number(m[8]!.slice(4, 6));
    if (oh > 23 || om > 59) return null;
    offsetMinutes = sign * (oh * 60 + om);
  }

  // Date.UTC maps years 0–99 to 1900–1999, so the year is set separately.
  const date = new Date(Date.UTC(2000, month - 1, day, hour, minute, second, ms));
  date.setUTCFullYear(year, month - 1, day);
  const time = date.getTime() - offsetMinutes * 60_000;
  const utcYear = new Date(time).getUTCFullYear();
  return utcYear < 1 || utcYear > 9999 ? null : new Date(time);
}

export function daysIn(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
