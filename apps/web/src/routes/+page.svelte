<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { api, type Payment } from '$lib/api';
  import Chart from '$lib/Chart.svelte';
  import { baseOptions, stackedBarScales, plainBarScales } from '$lib/chartOpts';
  import { COLORS, ACCENT, PLATFORMS, fmtAmount, fmtCount, taka, fmtAgo, fmtDateTime, platformLabel } from '$lib/format';
  import type { ChartConfiguration } from 'chart.js';

  const updated = $derived(auth.stats ? 'Updated ' + new Date().toLocaleTimeString() : '—');

  // Latest transaction + last 5 (payments, limit 6).
  let recent = $state<Payment[]>([]);
  let showRecent = $state(false);
  $effect(() => {
    if (!auth.token) return;
    api.payments(auth.token, { platform: 'all', page: 1, limit: 6 })
      .then((r) => (recent = r.payments))
      .catch(() => {});
  });
  const latest = $derived(recent[0]);

  function delta(curr: number, prev: number, label: string) {
    if (!prev) return null;
    const pct = Math.round(((curr - prev) / prev) * 100);
    return { pct: Math.abs(pct), cls: pct >= 0 ? 'up' : 'down', arrow: pct >= 0 ? '▲' : '▼', label };
  }

  const overviewCards = $derived.by(() => {
    const p = auth.stats?.periods;
    if (!p) return [];
    return [
      { label: 'Today', count: p.today.count, amount: p.today.amount, delta: delta(p.today.amount, p.yesterday.amount, 'yesterday') },
      { label: 'Yesterday', count: p.yesterday.count, amount: p.yesterday.amount, delta: null },
      { label: 'Last 7 days', count: p.last7.count, amount: p.last7.amount, delta: delta(p.last7.amount, p.prev7.amount, 'prior 7d') },
      { label: 'This month', count: p.month.count, amount: p.month.amount, delta: delta(p.month.amount, p.prevMonthSame.amount, 'last month') }
    ];
  });

  const allTimeCards = $derived.by(() => {
    const s = auth.stats;
    if (!s) return [];
    const by = s.totals.byPlatform || {};
    return [
      { label: 'All payments', cls: '', count: s.totals.count, amount: s.totals.amount },
      ...PLATFORMS.map((p) => ({ label: platformLabel(p), cls: p, count: by[p]?.count || 0, amount: by[p]?.amount || 0 }))
    ];
  });

  // ---- Chart configs ----
  const trendConfig = $derived.by((): ChartConfiguration | null => {
    const s = auth.stats;
    if (!s) return null;
    return {
      type: 'bar',
      data: {
        labels: s.daily.labels.map((d) => d.slice(5)),
        datasets: PLATFORMS.map((p) => ({ label: p, data: s.daily.series[p] || [], backgroundColor: COLORS[p], stack: 's', borderRadius: 3 }))
      },
      options: { ...baseOptions(), scales: stackedBarScales() }
    };
  });

  const shareConfig = $derived.by((): ChartConfiguration | null => {
    const s = auth.stats;
    if (!s) return null;
    const by = s.totals.byPlatform || {};
    return {
      type: 'doughnut',
      data: {
        labels: PLATFORMS.map(platformLabel),
        datasets: [{ data: PLATFORMS.map((p) => by[p]?.count || 0), backgroundColor: PLATFORMS.map((p) => COLORS[p]), borderColor: '#121A30', borderWidth: 2 }]
      },
      options: { ...baseOptions<'doughnut'>(), cutout: '62%' } as ChartConfiguration['options']
    };
  });

  const revenueConfig = $derived.by((): ChartConfiguration | null => {
    const s = auth.stats;
    if (!s) return null;
    const rev = s.revenue;
    return {
      type: 'bar',
      data: {
        labels: rev.labels.map((d) => d.slice(5)),
        datasets: PLATFORMS.map((p) => ({ label: p, data: rev.series[p] || [], backgroundColor: COLORS[p], stack: 'r', borderRadius: 3 }))
      },
      options: {
        ...baseOptions(),
        plugins: { ...baseOptions().plugins, tooltip: { callbacks: { label: (c: any) => `${c.dataset.label}: ${taka(c.parsed.y)}` } } },
        scales: stackedBarScales((v) => taka(Number(v)))
      }
    };
  });

  const revTotal = $derived.by(() => {
    const sum = (auth.stats?.revenue.total || []).reduce((a, b) => a + b, 0);
    return taka(sum) + ' in 14 days';
  });

  const peakConfig = $derived.by((): ChartConfiguration | null => {
    const s = auth.stats;
    if (!s) return null;
    return {
      type: 'bar',
      data: {
        labels: s.peakHours.labels.map((h) => h + ':00'),
        datasets: [{ data: s.peakHours.counts, backgroundColor: ACCENT, borderRadius: 3 }]
      },
      options: { ...baseOptions(), plugins: { legend: { display: false } }, scales: plainBarScales() }
    };
  });
</script>

<div class="page-head">
  <div>
    <h1>Dashboard</h1>
    <div class="sub">{updated}</div>
  </div>
  <div class="head-actions">
    <button class="btn ghost" onclick={() => auth.refresh()}>Refresh</button>
    <button class="btn ghost" onclick={() => auth.logout()}>Sign out</button>
  </div>
</div>

<!-- Latest transaction -->
<div class="panel" style="margin-bottom:26px;">
  <div class="panel-head">
    <h3>Latest transaction</h3>
    <a class="btn ghost" href="/transactions">See all ›</a>
  </div>
  {#if !latest}
    <div class="empty">No payments yet.</div>
  {:else}
    <div class="latest">
      <div class="latest-when">
        <span class="ago">{fmtAgo(latest.dateReceived)}</span>
        <span class="abs muted">{fmtDateTime(latest.dateReceived)}</span>
      </div>
      <div class="latest-main">
        <span class="pill {latest.platform}">{latest.platform}</span>
        <span class="latest-amt">৳ {fmtAmount(latest.amount)}</span>
      </div>
      <div class="latest-detail">
        <div><span class="muted">TrxID</span> <span class="mono">{latest.trxId}</span></div>
        <div><span class="muted">Sender</span> <span class="mono">{latest.sender}</span></div>
        <div><span class="muted">Ref</span> <span class="mono">{latest.ref || '—'}</span></div>
      </div>
    </div>
    <div style="margin-top:14px;">
      <button class="btn ghost" onclick={() => (showRecent = !showRecent)}>
        {showRecent ? 'Hide last 5 ›' : 'Show last 5 ›'}
      </button>
    </div>
    {#if showRecent}
      <div class="recent-list">
        {#each recent.slice(1) as r}
          <div class="recent-row">
            <span class="pill {r.platform}">{r.platform}</span>
            <span class="mono">{r.trxId}</span>
            <span class="amt-cell">৳ {fmtAmount(r.amount)}</span>
            <span class="muted">{fmtAgo(r.dateReceived)}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<div class="section-lbl">Overview</div>
<div class="overview">
  {#each overviewCards as c}
    <div class="stat">
      <div class="lbl">{c.label}</div>
      <div class="num">{fmtCount(c.count)}</div>
      <div class="amt">৳ {fmtAmount(c.amount)}</div>
      {#if c.delta}
        <div class="delta {c.delta.cls}">{c.delta.arrow} {c.delta.pct}% vs {c.delta.label}</div>
      {/if}
    </div>
  {/each}
</div>

<div class="section-lbl">All-time</div>
<div class="stats">
  {#each allTimeCards as c}
    <div class="stat">
      <div class="lbl">
        {#if c.cls}<span class="dot {c.cls}"></span>{/if}
        <span>{c.label}</span>
      </div>
      <div class="num">{fmtCount(c.count)}</div>
      <div class="amt">৳ {fmtAmount(c.amount)}</div>
    </div>
  {/each}
</div>

<div class="section-lbl">Trend · last 14 days</div>
<div class="charts">
  <div class="panel">
    <h3>Payments per day · last 14 days</h3>
    {#if trendConfig}<Chart config={trendConfig} />{/if}
  </div>
  <div class="panel">
    <h3>Share by platform</h3>
    {#if shareConfig}<Chart config={shareConfig} />{/if}
  </div>
</div>

<div class="panel" style="margin:26px 0;">
  <div class="panel-head">
    <h3>Revenue per day · last 14 days</h3>
    <span class="sub">{revTotal}</span>
  </div>
  {#if revenueConfig}<Chart config={revenueConfig} />{/if}
</div>

<div class="panel" style="margin-bottom:40px;">
  <h3>Peak hours · last 30 days</h3>
  {#if peakConfig}<Chart config={peakConfig} />{/if}
</div>

<style>
  .latest-when { display: flex; gap: 10px; align-items: baseline; margin-bottom: 8px; }
  .ago { font-weight: 600; }
  .abs { font-size: 0.82rem; }
  .latest-main { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .latest-amt { font-size: 1.5rem; font-weight: 700; color: #34d399; }
  .latest-detail { display: flex; flex-wrap: wrap; gap: 20px; font-size: 0.85rem; }
  .recent-list { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
  .recent-row { display: grid; grid-template-columns: 80px 1fr auto auto; gap: 12px; align-items: center; padding: 8px 0; border-top: 1px solid var(--panel-2); font-size: 0.85rem; }
</style>
