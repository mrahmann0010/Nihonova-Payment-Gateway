// admin.js — read-only admin dashboard data API.
//
// Routes (all under /admin):
//   GET /admin                 → dashboard HTML (public shell; data needs token)
//   GET /admin/api/payments    → paginated, filterable transaction list (token)
//   GET /admin/api/stats       → totals, 14-day daily/revenue series, period
//                                 comparisons (today/yesterday/7d/month), and
//                                 a 30-day peak-hours histogram (token)
//
// Auth: every /api/* route requires the admin token, supplied as either
//   ?token=<ADMIN_TOKEN>  or  Authorization: Bearer <ADMIN_TOKEN>  or
//   x-admin-token: <ADMIN_TOKEN>. Mirrors the dev-fallback behaviour of the
//   webhook auth: if ADMIN_TOKEN is unset, access is allowed in dev but
//   refused in production.

const crypto  = require('crypto');
const express = require('express');
const router  = express.Router();

const Bkash        = require('../models/Bkash');
const Nagad        = require('../models/Nagad');
const Rocket       = require('../models/Rocket');
const WebhookEvent = require('../models/WebhookEvent');
const { verify: verifyJwt, COOKIE_NAME } = require('../services/jwt');

const MODELS = { bkash: Bkash, nagad: Nagad, rocket: Rocket };

// Bangladesh local time — dates are stored in UTC, so we shift grouping back
// to +06:00 to keep "per day" buckets aligned with the local calendar.
const BD_TZ = '+06:00';
const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

// A Date whose UTC fields equal the current BD wall-clock fields (handy for
// reading BD calendar year/month/date with plain UTC getters).
function bdNow() {
  return new Date(Date.now() + BD_OFFSET_MS);
}

// BD calendar month start (`monthOffset` months from `bdWallClock`'s month),
// returned as the actual UTC instant that BD midnight corresponds to.
function bdMonthStartUTC(bdWallClock, monthOffset) {
  const y = bdWallClock.getUTCFullYear();
  const m = bdWallClock.getUTCMonth();
  const bdMidnightAsUTCFields = new Date(Date.UTC(y, m + monthOffset, 1, 0, 0, 0));
  return new Date(bdMidnightAsUTCFields.getTime() - BD_OFFSET_MS);
}

// A "YYYY-MM-DD" BD-calendar date string → the UTC instant of that day's
// BD midnight. Used to turn user-supplied report date-range bounds into
// Mongo-queryable UTC instants.
function bdDateStringToUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const bdMidnightAsUTCFields = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  return new Date(bdMidnightAsUTCFields.getTime() - BD_OFFSET_MS);
}

// ---------------------------------------------------------------------------
// Auth middleware for the data API.
// ---------------------------------------------------------------------------
function requireAdmin(req, res, next) {
  // Primary auth: the httpOnly JWT session cookie set at /admin/auth/login.
  const sessionToken = req.cookies?.[COOKIE_NAME];
  if (sessionToken) {
    try {
      verifyJwt(sessionToken);
      return next();
    } catch {
      // Fall through to the legacy token check below.
    }
  }

  // Legacy auth: shared ADMIN_TOKEN via header/query/bearer. Kept for
  // backward compatibility (e.g. scripts); the dashboard now uses the cookie.
  const secret = process.env.ADMIN_TOKEN;
  const isPlaceholder = !secret || secret === 'your-admin-token-here';

  if (isPlaceholder) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Admin] ADMIN_TOKEN not configured in production — rejecting request');
      return res.status(503).json({ error: 'Admin disabled — ADMIN_TOKEN not configured' });
    }
    console.warn('[Admin] ADMIN_TOKEN not configured — auth disabled (dev only)');
    return next();
  }

  const header = req.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const token  = req.query.token || req.get('x-admin-token') || bearer;

  if (!token) return res.status(401).json({ error: 'Missing token' });

  const expected = Buffer.from(secret);
  const received = Buffer.from(String(token));
  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  next();
}

// Shape a raw document into the fields the dashboard renders.
function serialize(doc, platform) {
  return {
    platform,
    trxId:        doc.trxId,
    amount:       doc.amount,
    sender:       doc.sender,
    fee:          doc.fee,
    balance:      doc.balance,
    ref:          doc.ref ?? null,
    dateReceived: doc.dateReceived,
    timeReceived: doc.timeReceived,
    rawDate:      doc.rawDate,
    simNumber:    doc.simNumber,
  };
}

// Build a case-insensitive search filter over trxId + sender.
function searchFilter(search) {
  if (!search) return {};
  const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(safe, 'i');
  return { $or: [{ trxId: rx }, { sender: rx }] };
}

// Fetch a paginated, filterable page of payments across one or all platforms.
// Shared by the JSON API and the htmx partial so both stay in lock-step.
async function fetchPayments({ platform, page, limit, search }) {
  const query = searchFilter(search);

  // Single platform — page directly in the database.
  if (platform !== 'all') {
    const Model = MODELS[platform];
    if (!Model) { const e = new Error('Unknown platform'); e.status = 400; throw e; }

    const [docs, total] = await Promise.all([
      Model.find(query).sort({ dateReceived: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Model.countDocuments(query),
    ]);
    return { payments: docs.map((d) => serialize(d, platform)), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  // All platforms — fetch the top (page*limit) from each collection, merge,
  // sort by time, then slice the requested page.
  const windowSize = page * limit;
  const results = await Promise.all(
    Object.entries(MODELS).map(async ([name, Model]) => {
      const [docs, count] = await Promise.all([
        Model.find(query).sort({ dateReceived: -1 }).limit(windowSize).lean(),
        Model.countDocuments(query),
      ]);
      return { name, docs, count };
    })
  );

  let total = 0;
  const merged = [];
  for (const r of results) {
    total += r.count;
    for (const d of r.docs) merged.push(serialize(d, r.name));
  }
  merged.sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived));
  const payments = merged.slice((page - 1) * limit, (page - 1) * limit + limit);
  return { payments, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

// Normalise the list query params shared by the API + partial routes.
function listParams(req) {
  return {
    platform: String(req.query.platform || 'all').toLowerCase(),
    page:  Math.max(1, parseInt(req.query.page, 10) || 1),
    limit: Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25)),
    search: (req.query.search || '').trim(),
  };
}

// ---------------------------------------------------------------------------
// Health data — freshness + webhook-event counts + recent-events log.
// Consumed as JSON by the SvelteKit frontend's Health page and alert bell.
// ---------------------------------------------------------------------------
async function computeHealth() {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since7d  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const freshness = await Promise.all(
    Object.entries(MODELS).map(async ([name, Model]) => {
      const last = await Model.findOne().sort({ dateReceived: -1 }).select('dateReceived').lean();
      const lastReceivedAt = last ? last.dateReceived : null;
      const hoursSince = lastReceivedAt ? (now - new Date(lastReceivedAt)) / 3600000 : null;
      return { name, lastReceivedAt, hoursSince };
    })
  );

  async function countsSince(since) {
    const agg = await WebhookEvent.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$reason', count: { $sum: 1 } } },
    ]);
    const out = { unmatched: 0, duplicate: 0, unknown_sender: 0, error: 0 };
    for (const r of agg) out[r._id] = r.count;
    return out;
  }
  const [counts24h, counts7d] = await Promise.all([countsSince(since24h), countsSince(since7d)]);

  const recentEvents = await WebhookEvent.find().sort({ createdAt: -1 }).limit(50).lean();

  return { freshness, counts24h, counts7d, recentEvents };
}

// JSON form of the same data — powers the dashboard's alert banner and the
// frontend Health page (freshness, event counts, and the recent-events log).
router.get('/api/health', requireAdmin, async (_req, res, next) => {
  try {
    const { freshness, counts24h, counts7d, recentEvents } = await computeHealth();
    res.json({ freshness, counts24h, counts7d, recentEvents });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /admin/api/payments
//   ?platform=all|bkash|nagad|rocket  &page=1  &limit=25  &search=
// ---------------------------------------------------------------------------
router.get('/api/payments', requireAdmin, async (req, res, next) => {
  try {
    const data = await fetchPayments(listParams(req));
    res.json(data);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/api/stats — totals per platform + 14-day daily counts.
// ---------------------------------------------------------------------------
router.get('/api/stats', requireAdmin, async (_req, res, next) => {
  try {
    const DAYS = 14;
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (DAYS - 1));

    const perPlatform = await Promise.all(
      Object.entries(MODELS).map(async ([name, Model]) => {
        const [totalsAgg, dailyAgg] = await Promise.all([
          Model.aggregate([
            { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
          ]),
          Model.aggregate([
            { $match: { dateReceived: { $gte: since } } },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$dateReceived', timezone: BD_TZ } },
                count: { $sum: 1 },
                amount: { $sum: '$amount' },
              },
            },
          ]),
        ]);

        const totals = totalsAgg[0] || { count: 0, amount: 0 };
        const countMap = {};
        const amountMap = {};
        for (const d of dailyAgg) { countMap[d._id] = d.count; amountMap[d._id] = d.amount; }
        return { name, count: totals.count, amount: totals.amount, countMap, amountMap };
      })
    );

    // Build the day axis (oldest → newest) in BD local calendar terms.
    const labels = [];
    const cursor = new Date(since);
    for (let i = 0; i < DAYS; i++) {
      const bd = new Date(cursor.getTime() + 6 * 60 * 60 * 1000);
      labels.push(bd.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const totals = { count: 0, amount: 0, byPlatform: {} };
    const series = {};          // daily payment counts, per platform
    const revenueSeries = {};   // daily revenue (amount), per platform
    for (const p of perPlatform) {
      totals.count += p.count;
      totals.amount += p.amount;
      totals.byPlatform[p.name] = { count: p.count, amount: p.amount };
      series[p.name] = labels.map((day) => p.countMap[day] || 0);
      revenueSeries[p.name] = labels.map((day) => p.amountMap[day] || 0);
    }

    // Combined revenue across all platforms, per day.
    const revenueTotal = labels.map((_, i) =>
      Object.values(revenueSeries).reduce((sum, arr) => sum + arr[i], 0)
    );

    // ---- Period comparisons ----
    // today/yesterday/last7/prev7 all fall inside the 14-day window above, so
    // they're read off the same countMap/amountMap rather than re-queried.
    function sumRange(startIdx, endIdx) {
      let count = 0, amount = 0;
      for (const p of perPlatform) {
        for (let i = startIdx; i <= endIdx; i++) {
          const day = labels[i];
          count += p.countMap[day] || 0;
          amount += p.amountMap[day] || 0;
        }
      }
      return { count, amount };
    }
    const today     = sumRange(DAYS - 1, DAYS - 1);
    const yesterday = sumRange(DAYS - 2, DAYS - 2);
    const last7     = sumRange(DAYS - 7, DAYS - 1);
    const prev7     = sumRange(0, DAYS - 8);

    // Month-to-date vs the same elapsed window last month (so day 3 of a
    // month doesn't compare against a full prior month and look like a drop).
    const now = new Date();
    const nowBD = bdNow();
    const thisMonthStart = bdMonthStartUTC(nowBD, 0);
    const lastMonthStart = bdMonthStartUTC(nowBD, -1);
    const lastMonthComparableEnd = new Date(lastMonthStart.getTime() + (now - thisMonthStart));

    const monthRanges = await Promise.all(
      Object.values(MODELS).map(async (Model) => {
        const [monthAgg, prevMonthAgg] = await Promise.all([
          Model.aggregate([
            { $match: { dateReceived: { $gte: thisMonthStart } } },
            { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
          ]),
          Model.aggregate([
            { $match: { dateReceived: { $gte: lastMonthStart, $lt: lastMonthComparableEnd } } },
            { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
          ]),
        ]);
        return { month: monthAgg[0] || { count: 0, amount: 0 }, prevMonth: prevMonthAgg[0] || { count: 0, amount: 0 } };
      })
    );
    const month = monthRanges.reduce(
      (a, r) => ({ count: a.count + r.month.count, amount: a.amount + r.month.amount }), { count: 0, amount: 0 });
    const prevMonthSame = monthRanges.reduce(
      (a, r) => ({ count: a.count + r.prevMonth.count, amount: a.amount + r.prevMonth.amount }), { count: 0, amount: 0 });

    // ---- Peak hours — transaction count by BD hour-of-day, last 30 days ----
    const PEAK_DAYS = 30;
    const peakSince = new Date(now.getTime() - PEAK_DAYS * 24 * 60 * 60 * 1000);
    const peakCounts = new Array(24).fill(0);
    await Promise.all(
      Object.values(MODELS).map(async (Model) => {
        const agg = await Model.aggregate([
          { $match: { dateReceived: { $gte: peakSince } } },
          { $group: { _id: { $hour: { date: '$dateReceived', timezone: BD_TZ } }, count: { $sum: 1 } } },
        ]);
        for (const row of agg) peakCounts[row._id] += row.count;
      })
    );

    res.json({
      totals,
      daily: { labels, series },
      revenue: { labels, series: revenueSeries, total: revenueTotal },
      periods: { today, yesterday, last7, prev7, month, prevMonthSame },
      peakHours: { labels: Array.from({ length: 24 }, (_, i) => i), counts: peakCounts },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
//   Custom date-range totals/fees/daily series + a top-senders breakdown for
//   drilling into the transactions list. Defaults to the last 30 BD days.
// ---------------------------------------------------------------------------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/api/reports', requireAdmin, async (req, res, next) => {
  try {
    const todayStr = bdNow().toISOString().slice(0, 10);
    const defaultFromStr = (() => {
      const d = bdNow();
      d.setUTCDate(d.getUTCDate() - 29);
      return d.toISOString().slice(0, 10);
    })();

    const from = DATE_RE.test(req.query.from) ? req.query.from : defaultFromStr;
    const to   = DATE_RE.test(req.query.to)   ? req.query.to   : todayStr;

    const rangeStart = bdDateStringToUTC(from);
    let rangeEndExclusive = new Date(bdDateStringToUTC(to).getTime() + 24 * 60 * 60 * 1000);
    // Guard against a runaway day-axis loop on bad/huge input.
    const MAX_DAYS = 366;
    if ((rangeEndExclusive - rangeStart) / (24 * 60 * 60 * 1000) > MAX_DAYS) {
      rangeEndExclusive = new Date(rangeStart.getTime() + MAX_DAYS * 24 * 60 * 60 * 1000);
    }
    const match = { dateReceived: { $gte: rangeStart, $lt: rangeEndExclusive } };

    const perPlatform = await Promise.all(
      Object.entries(MODELS).map(async ([name, Model]) => {
        const [totalsAgg, dailyAgg, senderAgg] = await Promise.all([
          Model.aggregate([
            { $match: match },
            { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' }, fee: { $sum: '$fee' } } },
          ]),
          Model.aggregate([
            { $match: match },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$dateReceived', timezone: BD_TZ } },
                amount: { $sum: '$amount' },
              },
            },
          ]),
          Model.aggregate([
            { $match: match },
            { $group: { _id: '$sender', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
          ]),
        ]);
        return { name, totals: totalsAgg[0] || { count: 0, amount: 0, fee: 0 }, dailyAgg, senderAgg };
      })
    );

    // Day axis across the requested range, in BD calendar terms.
    const labels = [];
    const cursor = new Date(rangeStart);
    while (cursor < rangeEndExclusive) {
      const bd = new Date(cursor.getTime() + BD_OFFSET_MS);
      labels.push(bd.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const totals = { count: 0, amount: 0, fee: 0, byPlatform: {} };
    const series = {};
    const senderMap = {};
    for (const p of perPlatform) {
      totals.count  += p.totals.count;
      totals.amount += p.totals.amount;
      totals.fee    += p.totals.fee || 0;
      totals.byPlatform[p.name] = { count: p.totals.count, amount: p.totals.amount, fee: p.totals.fee || 0 };

      const amountMap = {};
      for (const d of p.dailyAgg) amountMap[d._id] = d.amount;
      series[p.name] = labels.map((day) => amountMap[day] || 0);

      for (const s of p.senderAgg) {
        if (!senderMap[s._id]) senderMap[s._id] = { sender: s._id, count: 0, amount: 0 };
        senderMap[s._id].count += s.count;
        senderMap[s._id].amount += s.amount;
      }
    }
    const topSenders = Object.values(senderMap).sort((a, b) => b.amount - a.amount).slice(0, 15);

    res.json({ from, to, totals, daily: { labels, series }, topSenders });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
