// transactions.js (view) — the full transaction list at /admin/transactions.
//
// Filter by platform, search by trxId/sender, 20 rows per page with
// pagination. Chrome + token gate come from the shared shell.

const shell = require('./adminShell');

const PAGE_SIZE = 20;

const BODY = `
    <div class="page-head">
      <div>
        <h1>Transactions</h1>
        <div class="sub" id="updated">&mdash;</div>
      </div>
      <div class="head-actions">
        <a class="btn ghost" href="/admin">&lsaquo; Dashboard</a>
        <button class="btn ghost" id="logout">Sign out</button>
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
`;

const SCRIPT = `
var LIMIT = ${PAGE_SIZE};
var state = { platform: 'all', page: 1, search: '', pages: 1 };
var searchTimer = null;

function load() {
  var A = window.A;
  var qs = 'platform=' + state.platform + '&page=' + state.page +
           '&limit=' + LIMIT + '&search=' + encodeURIComponent(state.search);
  A.$('rows').innerHTML = '<tr><td colspan="9" class="loading">Loading…</td></tr>';
  A.api('/admin/api/payments?' + qs).then(function (data) {
    renderRows(data.payments);
    state.pages = data.pages;
    A.$('pageInfo').textContent = data.total + ' record' + (data.total === 1 ? '' : 's') +
      ' · page ' + data.page + ' / ' + data.pages;
    A.$('prev').disabled = data.page <= 1;
    A.$('next').disabled = data.page >= data.pages;
    A.$('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
  }).catch(function (e) {
    if (e.message === 'unauthorized') return;
    A.$('rows').innerHTML = '<tr><td colspan="9" class="empty">Failed to load — ' + A.esc(e.message) + '</td></tr>';
  });
}

function renderRows(list) {
  var A = window.A;
  if (!list || !list.length) {
    A.$('rows').innerHTML = '<tr><td colspan="9" class="empty">No payments found.</td></tr>';
    return;
  }
  A.$('rows').innerHTML = list.map(function (p) {
    return '<tr>' +
      '<td><span class="pill ' + p.platform + '">' + A.esc(p.platform) + '</span></td>' +
      '<td class="mono">' + A.esc(p.trxId) + '</td>' +
      '<td class="amt-cell">৳ ' + A.fmtAmount(p.amount) + '</td>' +
      '<td class="mono">' + A.esc(p.sender) + '</td>' +
      '<td class="mono dim">' + A.fmtAmount(p.fee) + '</td>' +
      '<td class="mono dim">' + A.fmtAmount(p.balance) + '</td>' +
      '<td class="mono dim">' + (p.ref ? A.esc(p.ref) : '—') + '</td>' +
      '<td class="mono dim">' + A.esc(A.fmtDateTime(p.dateReceived)) + '</td>' +
      '<td class="mono dim">' + (p.simNumber != null ? A.esc(p.simNumber) : '—') + '</td>' +
      '</tr>';
  }).join('');
}

window.__onAuth = function () { load(); };

document.getElementById('seg').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('active'); });
  b.classList.add('active');
  state.platform = b.dataset.platform; state.page = 1; load();
});
document.getElementById('search').addEventListener('input', function (e) {
  clearTimeout(searchTimer);
  var val = e.target.value.trim();
  searchTimer = setTimeout(function () { state.search = val; state.page = 1; load(); }, 300);
});
document.getElementById('prev').addEventListener('click', function () { if (state.page > 1) { state.page--; load(); } });
document.getElementById('next').addEventListener('click', function () { if (state.page < state.pages) { state.page++; load(); } });
`;

module.exports = () =>
  shell({
    title: 'Admin · Transactions',
    subtitle: 'admin',
    headerRight: '<a class="tag" href="/">&larr; Home</a>',
    body: BODY,
    script: SCRIPT,
    withChartJs: false,
  });
