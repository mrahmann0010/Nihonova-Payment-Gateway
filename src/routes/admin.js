// admin.js — read-only admin dashboard data API.
//
// Routes (all under /admin):
//   GET /admin                 → dashboard HTML (public shell; data needs token)
//   GET /admin/api/payments    → paginated, filterable transaction list (token)
//   GET /admin/api/stats       → totals + 14-day daily counts for charts (token)
//
// Auth: every /api/* route requires the admin token, supplied as either
//   ?token=<ADMIN_TOKEN>  or  Authorization: Bearer <ADMIN_TOKEN>  or
//   x-admin-token: <ADMIN_TOKEN>. Mirrors the dev-fallback behaviour of the
//   webhook auth: if ADMIN_TOKEN is unset, access is allowed in dev but
//   refused in production.

const crypto  = require('crypto');
const express = require('express');
const router  = express.Router();

const h = require('../views/helpers');

const Bkash  = require('../models/Bkash');
const Nagad  = require('../models/Nagad');
const Rocket = require('../models/Rocket');

const MODELS = { bkash: Bkash, nagad: Nagad, rocket: Rocket };

// Bangladesh local time — dates are stored in UTC, so we shift grouping back
// to +06:00 to keep "per day" buckets aligned with the local calendar.
const BD_TZ = '+06:00';

// ---------------------------------------------------------------------------
// Auth middleware for the data API.
// ---------------------------------------------------------------------------
function requireAdmin(req, res, next) {
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
// Pages (EJS shells — carry no data, so they stay public; data needs a token).
// ---------------------------------------------------------------------------
router.get('/', (_req, res) => res.render('admin'));
router.get('/transactions', (_req, res) => res.render('transactions'));

// ---------------------------------------------------------------------------
// htmx partials — server-rendered HTML fragments (token required).
// ---------------------------------------------------------------------------

// Latest transaction highlight + the preceding rows (limit 6 → 1 latest + 5).
router.get('/partials/recent', requireAdmin, async (_req, res, next) => {
  try {
    const { payments } = await fetchPayments({ platform: 'all', page: 1, limit: 6, search: '' });
    res.render('partials/recent', { payments, h });
  } catch (err) { next(err); }
});

// Transactions table body + pager.
router.get('/partials/transactions', requireAdmin, async (req, res, next) => {
  try {
    const params = listParams(req);
    if (req.query.limit == null) params.limit = 20;
    const data = await fetchPayments(params);
    res.render('partials/transactions-table', { ...data, platform: params.platform, search: params.search, h });
  } catch (err) {
    if (err.status === 400) return res.status(400).send('<div class="empty">Unknown platform.</div>');
    next(err);
  }
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

    res.json({
      totals,
      daily: { labels, series },
      revenue: { labels, series: revenueSeries, total: revenueTotal },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
