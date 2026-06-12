// admin.js (view) — the admin dashboard at /admin.
//
// Shows totals, analytics charts, and the 10 most recent transactions with a
// "See all" link through to the full, filterable list at /admin/transactions.
// Chrome + token gate come from the shared shell; this file only provides the
// body markup and the post-auth script.

const shell = require('./adminShell');

const BODY = `
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <div class="sub" id="updated">&mdash;</div>
      </div>
      <div class="head-actions">
        <button class="btn ghost" id="refresh">Refresh</button>
        <button class="btn ghost" id="logout">Sign out</button>
      </div>
    </div>

    <div class="stats" id="stats"></div>

    <div class="charts">
      <div class="panel">
        <h3>Payments per day &middot; last 14 days</h3>
        <div class="canvas-box"><canvas id="trendChart"></canvas></div>
      </div>
      <div class="panel">
        <h3>Share by platform</h3>
        <div class="canvas-box"><canvas id="shareChart"></canvas></div>
      </div>
    </div>

    <div class="panel" style="margin-bottom:26px;">
      <div class="panel-head">
        <h3>Revenue per day &middot; last 14 days</h3>
        <span class="sub" id="revTotal">&mdash;</span>
      </div>
      <div class="canvas-box"><canvas id="revenueChart"></canvas></div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>Recent transactions</h3>
        <a class="btn ghost" href="/admin/transactions">See all &rsaquo;</a>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Platform</th><th>TrxID</th><th>Amount</th><th>Sender</th>
              <th>Ref</th><th>Date &middot; time</th>
            </tr>
          </thead>
          <tbody id="rows"><tr><td colspan="6" class="loading">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>
`;

const SCRIPT = `
var trendChart = null, shareChart = null, revenueChart = null;

function renderStats(data) {
  var A = window.A, t = data.totals, by = t.byPlatform || {};
  var cards = [
    { label:'All payments', cls:'',       count:t.count,                amount:t.amount },
    { label:'bKash',        cls:'bkash',  count:(by.bkash||{}).count||0,  amount:(by.bkash||{}).amount||0 },
    { label:'Nagad',        cls:'nagad',  count:(by.nagad||{}).count||0,  amount:(by.nagad||{}).amount||0 },
    { label:'Rocket',       cls:'rocket', count:(by.rocket||{}).count||0, amount:(by.rocket||{}).amount||0 },
  ];
  A.$('stats').innerHTML = cards.map(function (c) {
    var dot = c.cls ? '<span class="dot ' + c.cls + '"></span>' : '';
    return '<div class="stat ' + c.cls + '">' +
      '<div class="lbl">' + dot + A.esc(c.label) + '</div>' +
      '<div class="num">' + (c.count || 0).toLocaleString() + '</div>' +
      '<div class="amt">৳ ' + A.fmtAmount(c.amount) + '</div></div>';
  }).join('');
  A.$('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
  renderCharts(data);
}

function renderCharts(data) {
  if (typeof Chart === 'undefined') { setTimeout(function(){ renderCharts(data); }, 150); return; }
  var A = window.A, d = data.daily, t = data.totals.byPlatform || {};

  var trendData = {
    labels: d.labels.map(function (s) { return s.slice(5); }),
    datasets: ['bkash','nagad','rocket'].map(function (p) {
      return { label:p, data:d.series[p] || [], backgroundColor:A.COLORS[p], stack:'s', borderRadius:3 };
    }),
  };
  var commonOpts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ labels:{ color:'#94A2BE', font:{ size:11 }, usePointStyle:true, boxWidth:7 } } },
  };
  if (trendChart) { trendChart.data = trendData; trendChart.update(); }
  else {
    trendChart = new Chart(A.$('trendChart'), {
      type:'bar', data:trendData,
      options:Object.assign({}, commonOpts, {
        scales:{
          x:{ stacked:true, grid:{ display:false }, ticks:{ color:'#5C6A86', font:{ size:10 } } },
          y:{ stacked:true, grid:{ color:'#18233D' }, ticks:{ color:'#5C6A86', precision:0, font:{ size:10 } }, beginAtZero:true },
        },
      }),
    });
  }

  var shareData = {
    labels:['bKash','Nagad','Rocket'],
    datasets:[{ data:[(t.bkash||{}).count||0,(t.nagad||{}).count||0,(t.rocket||{}).count||0],
      backgroundColor:[A.COLORS.bkash,A.COLORS.nagad,A.COLORS.rocket], borderColor:'#121A30', borderWidth:2 }],
  };
  if (shareChart) { shareChart.data = shareData; shareChart.update(); }
  else {
    shareChart = new Chart(A.$('shareChart'), {
      type:'doughnut', data:shareData,
      options:Object.assign({}, commonOpts, { cutout:'62%' }),
    });
  }

  // Revenue per day — stacked bars per platform (amount, ৳).
  var rev = data.revenue || { labels:d.labels, series:{}, total:[] };
  var revData = {
    labels: rev.labels.map(function (s) { return s.slice(5); }),
    datasets: ['bkash','nagad','rocket'].map(function (p) {
      return { label:p, data:rev.series[p] || [], backgroundColor:A.COLORS[p], stack:'r', borderRadius:3 };
    }),
  };
  var taka = function (v) { return '৳ ' + Number(v).toLocaleString('en-US', { maximumFractionDigits:0 }); };
  var revOpts = Object.assign({}, commonOpts, {
    plugins: Object.assign({}, commonOpts.plugins, {
      tooltip:{ callbacks:{ label:function (c) { return c.dataset.label + ': ' + taka(c.parsed.y); } } },
    }),
    scales:{
      x:{ stacked:true, grid:{ display:false }, ticks:{ color:'#5C6A86', font:{ size:10 } } },
      y:{ stacked:true, grid:{ color:'#18233D' }, beginAtZero:true,
          ticks:{ color:'#5C6A86', font:{ size:10 }, callback:function (v) { return taka(v); } } },
    },
  });
  if (revenueChart) { revenueChart.data = revData; revenueChart.options = revOpts; revenueChart.update(); }
  else { revenueChart = new Chart(A.$('revenueChart'), { type:'bar', data:revData, options:revOpts }); }

  var revSum = (rev.total || []).reduce(function (a, b) { return a + b; }, 0);
  A.$('revTotal').textContent = taka(revSum) + ' in 14 days';
}

function loadRecent() {
  var A = window.A;
  A.$('rows').innerHTML = '<tr><td colspan="6" class="loading">Loading…</td></tr>';
  A.api('/admin/api/payments?platform=all&limit=10').then(function (data) {
    var list = data.payments;
    if (!list || !list.length) {
      A.$('rows').innerHTML = '<tr><td colspan="6" class="empty">No payments yet.</td></tr>';
      return;
    }
    A.$('rows').innerHTML = list.map(function (p) {
      return '<tr>' +
        '<td><span class="pill ' + p.platform + '">' + A.esc(p.platform) + '</span></td>' +
        '<td class="mono">' + A.esc(p.trxId) + '</td>' +
        '<td class="amt-cell">৳ ' + A.fmtAmount(p.amount) + '</td>' +
        '<td class="mono">' + A.esc(p.sender) + '</td>' +
        '<td class="mono dim">' + (p.ref ? A.esc(p.ref) : '—') + '</td>' +
        '<td class="mono dim">' + A.esc(A.fmtDateTime(p.dateReceived)) + '</td>' +
        '</tr>';
    }).join('');
  }).catch(function (e) {
    if (e.message === 'unauthorized') return;
    A.$('rows').innerHTML = '<tr><td colspan="6" class="empty">Failed to load — ' + A.esc(e.message) + '</td></tr>';
  });
}

window.__onAuth = function (stats) {
  renderStats(stats);
  loadRecent();
};

document.getElementById('refresh').addEventListener('click', function () {
  window.A.api('/admin/api/stats').then(renderStats).catch(function(){});
  loadRecent();
});
`;

module.exports = () =>
  shell({
    title: 'Admin · Dashboard',
    subtitle: 'admin',
    headerRight: '<a class="tag" href="/">&larr; Home</a>',
    body: BODY,
    script: SCRIPT,
    withChartJs: true,
  });
