// logger.js — structured console logging for server events.
//
// Two output modes, chosen by LOG_FORMAT:
//   pretty (default) — fixed-width columns, Bangladesh local time, no year:
//     07-Aug 21:14:03 │ INFO  │ WEBHOOK │ saved      │ bkash  │  ৳ 1,500 │ trx=8H72KLM901 │ from=01712345678 sim=1
//   json             — one object per line, for log aggregators.
//
// Call shape:  log.info(scope, event, fields?)
//   scope  — subsystem, e.g. 'WEBHOOK' | 'SERVER' | 'DB' | 'AUTH'
//   event  — fixed-vocabulary slug, e.g. 'saved' | 'duplicate' | 'unmatched'.
//            Webhook slugs match WebhookEvent.reason so logs and DB rows align.
//   fields — platform / amount / trx get their own aligned columns; everything
//            else prints as key=value so a single grep (e.g. `trx=8H72`) finds
//            every line about one transaction.

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const JSON_MODE = (process.env.LOG_FORMAT || '').toLowerCase() === 'json';

// Colors only on an attached terminal — Docker/journald logs stay clean.
const USE_COLOR = process.stdout.isTTY && !JSON_MODE;

const COLORS = {
  reset: '\x1b[0m',
  dim:   '\x1b[2m',
  INFO:  '\x1b[32m',
  WARN:  '\x1b[33m',
  ERROR: '\x1b[31m',
};

function paint(text, color) {
  return USE_COLOR && color ? `${color}${text}${COLORS.reset}` : text;
}

const pad = (v, n) => String(v ?? '').padEnd(n).slice(0, n);
const padStart = (v, n) => String(v ?? '').padStart(n).slice(-n);

// "07-Aug 21:14:03" in Bangladesh time. Shift the instant by +6h and read the
// UTC parts — avoids depending on the host's TZ, which containers rarely set.
function bdStamp(date = new Date()) {
  const d = new Date(date.getTime() + BD_OFFSET_MS);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}-${MONTHS[d.getUTCMonth()]} ` +
         `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// 1500 → "৳ 1,500". Blank when there's no amount, so the column stays aligned.
function money(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '';
  return `৳ ${Number(amount).toLocaleString('en-US')}`;
}

function format(level, scope, event, fields) {
  const { platform, amount, trx, ...rest } = fields || {};

  if (JSON_MODE) {
    return JSON.stringify({
      t: new Date().toISOString(),
      lvl: level.toLowerCase(),
      scope,
      event,
      ...(platform != null ? { platform } : {}),
      ...(amount   != null ? { amount }   : {}),
      ...(trx      != null ? { trx }      : {}),
      ...rest,
    });
  }

  const cols = [
    paint(bdStamp(), COLORS.dim),
    paint(pad(level, 5), COLORS[level]),
    pad(scope, 7),
    pad(event, 10),
  ];

  // Render the money columns for any line that carries one of them, so
  // consecutive payment lines line up vertically even when a field is absent.
  if (platform != null || amount != null || trx != null) {
    cols.push(pad(platform || '-', 6), padStart(money(amount), 9), pad(trx ? `trx=${trx}` : '', 18));
  }

  const tail = Object.entries(rest)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');

  const line = cols.join(paint(' │ ', COLORS.dim));
  return tail ? `${line}${paint(' │ ', COLORS.dim)}${tail}` : line;
}

function emit(level, scope, event, fields) {
  const line = format(level, scope, event, fields);
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
}

module.exports = {
  info:  (scope, event, fields) => emit('INFO', scope, event, fields),
  warn:  (scope, event, fields) => emit('WARN', scope, event, fields),
  error: (scope, event, fields) => emit('ERROR', scope, event, fields),
};
