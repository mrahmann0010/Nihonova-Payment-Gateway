// adminShell.js — shared HTML shell for the admin pages.
//
// Both the dashboard (/admin) and the transactions list (/admin/transactions)
// share the same chrome: head + CSS, header bar, the token gate, and a small
// client runtime exposed as `window.A` (auth + formatting helpers). A page
// supplies its own body markup and a script that defines `window.__onAuth`,
// which the shell calls once the admin token is verified.

const CSS = `
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
    transition:color 0.2s, border-color 0.2s;
  }
  a.tag:hover { color:var(--text); border-color:var(--accent); }

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
    border:0; border-radius:10px; padding:11px 18px; white-space:nowrap; transition:opacity 0.2s;
  }
  .btn.ghost { background:var(--bg-elev); border:1px solid var(--border); color:var(--text-dim); }
  .btn.ghost:hover { color:var(--text); border-color:var(--accent); }
  .btn:disabled { opacity:0.5; cursor:default; }
  .gate-err { color:var(--down); font-family:var(--mono); font-size:12px; margin-top:12px; min-height:16px; }

  .hidden { display:none !important; }
  .app { padding:30px 0 60px; }

  .page-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:24px; flex-wrap:wrap; }
  .page-head h1 { font-family:var(--display); font-weight:600; font-size:1.6rem; letter-spacing:-0.02em; }
  .page-head .sub { font-family:var(--mono); font-size:11.5px; color:var(--text-faint); margin-top:2px; }
  .head-actions { display:flex; gap:8px; }

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

  .charts { display:grid; grid-template-columns:1.6fr 1fr; gap:12px; margin-bottom:26px; }
  .panel { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px 18px; }
  .panel h3 { font-family:var(--mono); font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--text-faint); margin-bottom:14px; }
  .panel-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
  .panel-head h3 { margin-bottom:0; }
  .canvas-box { position:relative; height:240px; }

  .toolbar { display:flex; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
  .seg { display:flex; gap:1px; background:var(--border-soft); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
  .seg button {
    font-family:var(--mono); font-size:12px; color:var(--text-dim); background:var(--bg-elev);
    border:0; padding:8px 14px; cursor:pointer;
  }
  .seg button.active { background:var(--accent-soft); color:var(--text); }
  .toolbar .search { flex:1; min-width:160px; }
  .toolbar input { width:100%; }

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
`;

// Shared client runtime + token gate. Defines window.A and verifies the token
// against /admin/api/stats before revealing the page body.
const GATE_SCRIPT = `
(function () {
  var KEY = 'admin_token';
  var token = sessionStorage.getItem(KEY) || '';

  var $ = function (id) { return document.getElementById(id); };
  var COLORS = { bkash:'#E2136E', nagad:'#F6921E', rocket:'#8A2BE2' };

  function fmtAmount(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-GB', { timeZone:'Asia/Dhaka', day:'2-digit',
      month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function api(path) {
    return fetch(path, { headers: { 'x-admin-token': window.A.token } }).then(function (r) {
      if (r.status === 401) { sessionStorage.removeItem(KEY); showGate('Session expired — sign in again.'); throw new Error('unauthorized'); }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  window.A = { token: token, $: $, COLORS: COLORS, fmtAmount: fmtAmount, fmtDateTime: fmtDateTime, esc: esc, api: api };

  function showGate(msg) {
    $('gate').classList.remove('hidden');
    $('app').classList.add('hidden');
    if (msg) $('gateErr').textContent = msg;
  }
  function showApp() { $('gate').classList.add('hidden'); $('app').classList.remove('hidden'); }

  function attempt(t) {
    $('gateErr').textContent = '';
    return fetch('/admin/api/stats', { headers: { 'x-admin-token': t } }).then(function (r) {
      if (r.status === 401) throw new Error('Invalid token');
      if (!r.ok) throw new Error('Server error (' + r.status + ')');
      return r.json();
    }).then(function (data) {
      window.A.token = token = t; sessionStorage.setItem(KEY, t);
      showApp();
      if (typeof window.__onAuth === 'function') window.__onAuth(data);
    });
  }

  var enterBtn = $('enter');
  if (enterBtn) {
    enterBtn.addEventListener('click', function () {
      var t = $('token').value.trim();
      if (!t) { $('gateErr').textContent = 'Token required.'; return; }
      attempt(t).catch(function (e) { showGate(e.message); });
    });
    $('token').addEventListener('keydown', function (e) { if (e.key === 'Enter') enterBtn.click(); });
  }
  var logoutBtn = $('logout');
  if (logoutBtn) logoutBtn.addEventListener('click', function () { sessionStorage.removeItem(KEY); location.reload(); });

  if (token) {
    attempt(token).catch(function () { sessionStorage.removeItem(KEY); showGate(); });
  } else {
    showGate();
  }
})();
`;

// Build a full admin HTML page.
//   subtitle    — text after "sms-webhook /" in the header brand
//   headerRight — HTML for the top-right of the header bar
//   body        — page body markup, injected inside <section id="app">
//   script      — page script defining window.__onAuth(statsData)
//   withChartJs — include the Chart.js CDN script when true
function shell({ title, subtitle, headerRight, body, script, withChartJs }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<meta name="color-scheme" content="dark" />
<meta name="robots" content="noindex" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" /></noscript>
<style>${CSS}</style>
</head>
<body>

<header>
  <div class="wrap bar">
    <div class="brand">
      <div class="mark">&#8250;_</div>
      <div class="name">sms-webhook<span> /${subtitle}</span></div>
    </div>
    ${headerRight}
  </div>
</header>

<main class="wrap">

  <section class="gate" id="gate">
    <h2>Admin access</h2>
    <p>Enter the admin token to view payment records and analytics.</p>
    <div class="field">
      <input type="password" id="token" placeholder="ADMIN_TOKEN" autocomplete="off" />
      <button class="btn" id="enter">Enter</button>
    </div>
    <div class="gate-err" id="gateErr"></div>
  </section>

  <section class="app hidden" id="app">
${body}
  </section>

</main>

${withChartJs ? '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js" defer></script>' : ''}
<script>${GATE_SCRIPT}</script>
<script>${script}</script>

</body>
</html>`;
}

module.exports = shell;
