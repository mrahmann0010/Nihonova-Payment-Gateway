// rateLimit.js — a fixed-window counter, in process, no dependency.
//
// There was no rate limiting anywhere in this app. /v1/claims is the first
// route a third party calls on a schedule we do not control: the SMS lags the
// customer, so the documented client behaviour is to *poll* on 404 for around
// two minutes. A polling caller with a bug, or a retry loop without backoff,
// is the realistic load here — not an attack.
//
// ## In process, and what that costs
//
// The counters live in this process's memory, like services/totalsCache.js. On
// one instance that is exactly right. Across N instances each gets its own
// window, so the effective limit is N× what is configured — the limit becomes a
// guard rail rather than a quota. That is the honest trade, and it is the right
// way round: a distributed counter needs Redis, and an outage in it would have
// to either fail open (no limit) or fail closed (checkout down). Neither is
// worth paying for a guard rail. If a hard quota is ever needed, that is the
// moment to add the shared store, not before.
//
// Fixed window rather than a sliding one for the same reason: a caller can burst
// at a window boundary to twice the rate, which for a guard rail is fine and
// costs no per-request bookkeeping.

// Windows are swept lazily on access, but a client that stops calling would
// otherwise leave its bucket behind forever, so an occasional full sweep keeps
// the map bounded by active callers rather than by all callers ever seen.
const SWEEP_EVERY_MS = 10 * 60_000;

function createRateLimiter({ limit, windowMs, key }) {
  const buckets = new Map();
  let lastSweep = Date.now();

  function sweep(now) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    lastSweep = now;
  }

  // Returns { ok } or { ok: false, retryAfterSec } — the caller decides the
  // response shape, since this module knows nothing about /v1's error taxonomy.
  return function check(req) {
    const now = Date.now();
    if (now - lastSweep > SWEEP_EVERY_MS) sweep(now);

    const k = key(req);
    // No key means nothing to attribute the request to. Don't invent a shared
    // bucket for those — that would let one unattributable caller exhaust the
    // limit for every other one.
    if (!k) return { ok: true };

    let bucket = buckets.get(k);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(k, bucket);
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
    }
    return { ok: true };
  };
}

module.exports = { createRateLimiter };
