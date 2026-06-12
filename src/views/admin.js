// admin.js (view) — the admin dashboard HTML shell.
//
// Carries no data itself: a small client script authenticates with the admin
// token (stored in sessionStorage) and pulls /admin/api/stats + /api/payments.
// Styling mirrors the public home page; charts use Chart.js from a CDN to keep
// the server dependency-free.

module.exports = () => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Admin · Payments</title>
<meta name="color-scheme" content="dark" />
<meta name="robots" content="noindex" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" /></noscript>
<style>
  :root {
    --bg:#090D18; --bg-elev:#0E1426; --surface:#121A30; --surface-2:#16203A;
    --border:#1E2A47; --border-soft:#18233D; --text:#EDF1F8; --text-dim:#94A2BE;
    --text-faint:#5C6A86; --accent:#4F7BFF; --accent-deep:#2B4FD8;
    --accent-soft:rgba(79,123,255,0.12); --ok:#3DDC97; --warn:#FFB54F; --down:#FF6B6B;
    --bkash:#E2136E; --nagad:#F6921E; --rocket:#8A2BE2;
    --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
    --display:"Space Grotesk",system-ui,sans-serif;
    --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  body {
    background:var(--bg); color:var(--text); font-family:var(--sans); line-height:1.6;
    min-height:100vh; -webkit-font-smoothing:antialiased;
    background-image:radial-gradient(circle at 50% -10%, rgba(79,123,255,0.10), transparent 55%);
    background-repeat:no-repeat;
  }
  .wrap { width:100%; max-width:1040px; margin:0 auto; padding:0 22px; }
  a { color:var(--accent); text-decoration:none; }

  header { border-bottom:1px solid var(--border-soft); }
  .bar { display:flex; align-items:center; justify-content:space-between; padding:18px 0; }
  .brand { display:flex; align-items:center; gap:11px; }
  .mark {
    width:30px; height:30px; border-radius:8px;
    background:linear-gradient(150deg,var(--accent),var(--accent-deep));
    box-shadow:0 2px 14px rgba(79,123,255,0.35), inset 0 1px 0 rgba(255,255,255,0.25);
    display:grid; place-items:center; color:#fff; font-family:var(--mono); font-size:15px;
  }
  .brand .name { font-family:var(--mono); font-size:13.5px; color:var(--text); }
  .brand .name span { color:var(--text-faint); }
  .tag {
    font-family:var(--mono); font-size:11px; letter-spacing:0.04em; color:var(--text-dim);
    border:1px solid var(--border); border-radius:999px; padding:4px 11px;
  }

  /* gate */
  .gate { padding:80px 0; max-width:420px; margin:0 auto; }
  .gate h2 { font-family:var(--display); font-weight:600; font-size:1.5rem; margin-bottom:8px; }
  .gate p { color:var(--text-dim); font-size:14px; margin-bottom:22px; }
  .field { display:flex; gap:10px; }
  input[type=password], input[type=text] {
    flex:1; background:var(--bg-elev); border:1px solid var(--border); border-radius:10px;
    color:var(--text); font-family:var(--mono); font-size:13px; padding:11px 13px; outline:none;
  }
  input:focus { border-color:var(--accent); }
  .btn {
    font-family:var(--mono); font-size:13px; color:#fff; cursor:pointer;
    background:linear-gradient(150deg,var(--accent),var(--accent-deep));
    border:0; border-radius:10px; padding:11px 18px; white-space:nowrap;
  }
  .btn.ghost { background:var(--bg-elev); border:1px solid var(--border); color:var(--text-dim); }
  .btn:disabled { opacity:0.5; cursor:default; }
  .gate-err { color:var(--down); font-family:var(--mono); font-size:12px; margin-top:12px; min-height:16px; }

  .hidden { display:none !important; }
  .app { padding:30px 0 60px; }

  .page-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:24px; flex-wrap:wrap; }
  .page-head h1 { font-family:var(--display); font-weight:600; font-size:1.6rem; letter-spacing:-0.02em; }
  .page-head .sub { font-family:var(--mono); font-size:11.5px; color:var(--text-faint); margin-top:2px; }

  /* stat cards */
  .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:26px; }
  .stat {
    background:radial-gradient(140% 120% at 12% -20%, rgba(79,123,255,0.10), transparent 60%), var(--surface);
    border:1px solid var(--border); border-radius:14px; padding:16px 16px;
  }
  .stat .lbl { font-family:var(--mono); font-size:10px; letter-spacing:0.12em; text-transform:uppercase; color:var(--text-faint); }
  .stat .num { font-family:var(--display); font-weight:600; font-size:1.5rem; margin-top:6px; }
  .stat .amt { font-family:var(--mono); font-size:11.5px; color:var(--text-dim); margin-top:4px; }
  .stat.bkash  { border-color:rgba(226,19,110,0.4); }
  .stat.nagad  { border-color:rgba(246,146,30,0.4); }
  .stat.rocket { border-color:rgba(138,43,226,0.4); }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:middle; }
  .dot.bkash{background:var(--bkash)} .dot.nagad{background:var(--nagad)} .dot.rocket{background:var(--rocket)}

  /* charts */
  .charts { display:grid; grid-template-columns:1.6fr 1fr; gap:12px; margin-bottom:26px; }
  .panel { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px 18px; }
  .panel h3 { font-family:var(--mono); font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--text-faint); margin-bottom:14px; }
  .canvas-box { position:relative; height:240px; }

  /* filters */
  .toolbar { display:flex; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
  .seg { display:flex; gap:1px; background:var(--border-soft); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
  .seg button {
    font-family:var(--mono); font-size:12px; color:var(--text-dim); background:var(--bg-elev);
    border:0; padding:8px 14px; cursor:pointer;
  }
  .seg button.active { background:var(--accent-soft); color:var(--text); }
  .toolbar .search { flex:1; min-width:160px; }
  .toolbar input { width:100%; }

  /* table */
  .table-wrap { border:1px solid var(--border); border-radius:14px; overflow:hidden; }
  .table-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }
  table { width:100%; border-collapse:collapse; font-size:13px; min-width:760px; }
  thead th {
    font-family:var(--mono); font-size:10px; letter-spacing:0.1em; text-transform:uppercase;
    color:var(--text-faint); text-align:left; padding:12px 14px; background:var(--bg-elev);
    border-bottom:1px solid var(--border-soft); white-space:nowrap;
  }
  tbody td { padding:12px 14px; border-bottom:1px solid var(--border-soft); white-space:nowrap; }
  tbody tr:last-child td { border-bottom:0; }
  tbody tr:hover { background:var(--surface-2); }
  .pill {
    font-family:var(--mono); font-size:10.5px; padding:3px 9px; border-radius:999px;
    text-transform:capitalize; border:1px solid transparent;
  }
  .pill.bkash  { color:var(--bkash);  background:rgba(226,19,110,0.12); border-color:rgba(226,19,110,0.3); }
  .pill.nagad  { color:var(--nagad);  background:rgba(246,146,30,0.12); border-color:rgba(246,146,30,0.3); }
  .pill.rocket { color:var(--rocket); background:rgba(138,43,226,0.12); border-color:rgba(138,43,226,0.3); }
  .mono { font-family:var(--mono); font-size:12px; }
  .amt-cell { font-family:var(--mono); color:var(--ok); }
  .dim { color:var(--text-faint); }
  .empty, .loading { padding:40px; text-align:center; color:var(--text-faint); font-family:var(--mono); font-size:13px; }

  .pager { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px; background:var(--bg-elev); border-top:1px solid var(--border-soft); }
  .pager .info { font-family:var(--mono); font-size:11.5px; color:var(--text-faint); }
  .pager .nav { display:flex; gap:8px; }

  @media (max-width:820px) {
    .stats { grid-template-columns:1fr 1fr; }
    .charts { grid-template-columns:1fr; }
  }
</style>
</head>
<body>

<header>
  <div class="wrap bar">
    <div class="brand">
      <div class="mark">&#8250;_</div>
      <div class="name">sms-webhook<span> /admin</span></div>
    </div>
    <a class="tag" href="/">&larr; Home</a>
  </div>
</header>

<main class="wrap">

  <!-- token gate -->
  <section class="gate" id="gate">
    <h2>Admin access</h2>
    <p>Enter the admin token to view payment records and analytics.</p>
    <div class="field">
      <input type="password" id="token" placeholder="ADMIN_TOKEN" autocomplete="off" />
      <button class="btn" id="enter">Enter</button>
    </div>
    <div class="gate-err" id="gateErr"></div>
  </section>

  <!-- dashboard -->
  <section class="app hidden" id="app">
    <div class="page-head">
      <div>
        <h1>Payments</h1>
        <div class="sub" id="updated">&mdash;</div>
      </div>
      <div class="nav">
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

    <div class="toolbar">
      <div class="seg" id="seg">
        <button data-platform="all" class="active">All</button>
        <button data-platform="bkash">bKash</button>
        <button data-platform="nagad">Nagad</button>
        <button data-platform="rocket">Rocket</button>
      </div>
      <div class="search"><input type="text" id="search" placeholder="Search trxId or sender…" /></div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Platform</th><th>TrxID</th><th>Amount</th><th>Sender</th>
              <th>Fee</th><th>Balance</th><th>Ref</th><th>Date &middot; time</th><th>SIM</th>
            </tr>
          </thead>
          <tbody id="rows"><tr><td colspan="9" class="loading">Loading…</td></tr></tbody>
        </table>
      </div>
      <div class="pager">
        <span class="info" id="pageInfo">&mdash;</span>
        <div class="nav">
          <button class="btn ghost" id="prev">Prev</button>
          <button class="btn ghost" id="next">Next</button>
        </div>
      </div>
    </div>
  </section>

</main>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js" defer></script>
<script>
(function () {
  var KEY = 'admin_token';
  var token = sessionStorage.getItem(KEY) || '';
  var state = { platform: 'all', page: 1, search: '', pages: 1 };
  var trendChart = null, shareChart = null;
  var searchTimer = null;

  var $ = function (id) { return document.getElementById(id); };
  var COLORS = { bkash:'#E2136E', nagad:'#F6921E', rocket:'#8A2BE2' };

  function authHeaders() { return { 'x-admin-token': token }; }

  function fmtAmount(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleString('en-GB', { timeZone:'Asia/Dhaka', day:'2-digit', month:'short',
      year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  // ---- auth gate ----
  function showGate(msg) {
    $('gate').classList.remove('hidden');
    $('app').classList.add('hidden');
    if (msg) $('gateErr').textContent = msg;
  }
  function showApp() {
    $('gate').classList.add('hidden');
    $('app').classList.remove('hidden');
  }

  function attempt(t) {
    $('gateErr').textContent = '';
    return fetch('/admin/api/stats', { headers: { 'x-admin-token': t } })
      .then(function (r) {
        if (r.status === 401) throw new Error('Invalid token');
        if (!r.ok) throw new Error('Server error (' + r.status + ')');
        return r.json();
      })
      .then(function (data) {
        token = t; sessionStorage.setItem(KEY, t);
        showApp(); renderStats(data); loadPayments();
      });
  }

  // ---- stats + charts ----
  function renderStats(data) {
    var t = data.totals;
    var by = t.byPlatform || {};
    var cards = [
      { key:'all',    label:'All payments', cls:'',       count:t.count, amount:t.amount },
      { key:'bkash',  label:'bKash',        cls:'bkash',  count:(by.bkash||{}).count||0,  amount:(by.bkash||{}).amount||0 },
      { key:'nagad',  label:'Nagad',        cls:'nagad',  count:(by.nagad||{}).count||0,  amount:(by.nagad||{}).amount||0 },
      { key:'rocket', label:'Rocket',       cls:'rocket', count:(by.rocket||{}).count||0, amount:(by.rocket||{}).amount||0 },
    ];
    $('stats').innerHTML = cards.map(function (c) {
      var dot = c.cls ? '<span class="dot ' + c.cls + '"></span>' : '';
      return '<div class="stat ' + c.cls + '">' +
        '<div class="lbl">' + dot + esc(c.label) + '</div>' +
        '<div class="num">' + (c.count || 0).toLocaleString() + '</div>' +
        '<div class="amt">৳ ' + fmtAmount(c.amount) + '</div></div>';
    }).join('');
    $('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
    renderCharts(data);
  }

  function renderCharts(data) {
    if (typeof Chart === 'undefined') { setTimeout(function(){ renderCharts(data); }, 150); return; }
    var d = data.daily;
    var t = data.totals.byPlatform || {};

    var trendData = {
      labels: d.labels.map(function (s) { return s.slice(5); }),
      datasets: ['bkash','nagad','rocket'].map(function (p) {
        return { label:p, data:d.series[p] || [], backgroundColor:COLORS[p], stack:'s', borderRadius:3 };
      }),
    };
    var commonOpts = {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:'#94A2BE', font:{ size:11 }, usePointStyle:true, boxWidth:7 } } },
    };
    if (trendChart) {
      trendChart.data = trendData; trendChart.update();
    } else {
      trendChart = new Chart($('trendChart'), {
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
        backgroundColor:[COLORS.bkash,COLORS.nagad,COLORS.rocket], borderColor:'#121A30', borderWidth:2 }],
    };
    if (shareChart) {
      shareChart.data = shareData; shareChart.update();
    } else {
      shareChart = new Chart($('shareChart'), {
        type:'doughnut', data:shareData,
        options:Object.assign({}, commonOpts, { cutout:'62%' }),
      });
    }
  }

  // ---- payments table ----
  function loadPayments() {
    var qs = 'platform=' + state.platform + '&page=' + state.page +
             '&search=' + encodeURIComponent(state.search);
    $('rows').innerHTML = '<tr><td colspan="9" class="loading">Loading…</td></tr>';
    fetch('/admin/api/payments?' + qs, { headers: authHeaders() })
      .then(function (r) {
        if (r.status === 401) { sessionStorage.removeItem(KEY); showGate('Session expired — sign in again.'); return null; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data) return;
        renderRows(data.payments);
        state.pages = data.pages;
        $('pageInfo').textContent = data.total + ' record' + (data.total === 1 ? '' : 's') +
          ' · page ' + data.page + ' / ' + data.pages;
        $('prev').disabled = data.page <= 1;
        $('next').disabled = data.page >= data.pages;
      })
      .catch(function (e) {
        $('rows').innerHTML = '<tr><td colspan="9" class="empty">Failed to load — ' + esc(e.message) + '</td></tr>';
      });
  }

  function renderRows(list) {
    if (!list || !list.length) {
      $('rows').innerHTML = '<tr><td colspan="9" class="empty">No payments found.</td></tr>';
      return;
    }
    $('rows').innerHTML = list.map(function (p) {
      return '<tr>' +
        '<td><span class="pill ' + p.platform + '">' + esc(p.platform) + '</span></td>' +
        '<td class="mono">' + esc(p.trxId) + '</td>' +
        '<td class="amt-cell">৳ ' + fmtAmount(p.amount) + '</td>' +
        '<td class="mono">' + esc(p.sender) + '</td>' +
        '<td class="mono dim">' + fmtAmount(p.fee) + '</td>' +
        '<td class="mono dim">' + fmtAmount(p.balance) + '</td>' +
        '<td class="mono dim">' + (p.ref ? esc(p.ref) : '—') + '</td>' +
        '<td class="mono dim">' + esc(fmtDateTime(p.dateReceived)) + '</td>' +
        '<td class="mono dim">' + (p.simNumber != null ? esc(p.simNumber) : '—') + '</td>' +
        '</tr>';
    }).join('');
  }

  function refreshStats() {
    fetch('/admin/api/stats', { headers: authHeaders() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) renderStats(d); });
  }

  // ---- events ----
  $('enter').addEventListener('click', function () {
    var t = $('token').value.trim();
    if (!t) { $('gateErr').textContent = 'Token required.'; return; }
    attempt(t).catch(function (e) { showGate(e.message); });
  });
  $('token').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('enter').click(); });

  $('logout').addEventListener('click', function () {
    sessionStorage.removeItem(KEY); token = ''; location.reload();
  });
  $('refresh').addEventListener('click', function () { refreshStats(); loadPayments(); });

  $('seg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    Array.prototype.forEach.call($('seg').children, function (c) { c.classList.remove('active'); });
    b.classList.add('active');
    state.platform = b.dataset.platform; state.page = 1; loadPayments();
  });
  $('search').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.search = e.target.value.trim(); state.page = 1; loadPayments();
    }, 300);
  });
  $('prev').addEventListener('click', function () { if (state.page > 1) { state.page--; loadPayments(); } });
  $('next').addEventListener('click', function () { if (state.page < state.pages) { state.page++; loadPayments(); } });

  // ---- boot ----
  if (token) {
    attempt(token).catch(function () { sessionStorage.removeItem(KEY); showGate(); });
  } else {
    showGate();
  }
})();
</script>

</body>
</html>`;
