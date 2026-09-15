// totalsCache.js — in-process cache for the dashboard's all-time totals.
//
// All-time totals have no date bound, so computing them scans every payment in
// every collection — and /admin/api/stats is hit on every dashboard mount and
// window focus. They only change when the webhook stores a payment, so cache
// them until then. The max age covers changes this process can't see (manual DB
// edits, reset-db, a second instance).

const MAX_AGE_MS = 10 * 60 * 1000;

let cached = null; // { promise, at }

// Returns the cached totals, running `compute` on a miss. Concurrent callers
// share one in-flight computation.
function getAllTimeTotals(compute) {
  if (cached && Date.now() - cached.at < MAX_AGE_MS) return cached.promise;

  const entry = { at: Date.now(), promise: null };
  entry.promise = compute().catch((err) => {
    // Don't cache a failure — but don't clobber a newer entry either.
    if (cached === entry) cached = null;
    throw err;
  });
  cached = entry;
  return entry.promise;
}

function invalidateAllTimeTotals() {
  cached = null;
}

module.exports = { getAllTimeTotals, invalidateAllTimeTotals };
