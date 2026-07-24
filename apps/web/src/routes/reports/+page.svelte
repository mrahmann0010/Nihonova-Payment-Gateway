<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { api, type Report } from '$lib/api';
  import Chart from '$lib/Chart.svelte';
  import { baseOptions, stackedBarScales } from '$lib/chartOpts';
  import { COLORS, PLATFORMS, fmtAmount, fmtCount, taka, platformLabel } from '$lib/format';
  import type { ChartConfiguration } from 'chart.js';

  let from = $state('');
  let to = $state('');
  let data = $state<Report | null>(null);

  async function load() {
    if (!auth.authed) return;
    const r = await api.reports(from || undefined, to || undefined);
    data = r;
    from = r.from;
    to = r.to;
  }

  function setPreset(days: number) {
    const t = new Date();
    const f = new Date();
    f.setDate(f.getDate() - (days - 1));
    to = t.toISOString().slice(0, 10);
    from = f.toISOString().slice(0, 10);
    load();
  }

  // Initial load (defaults to last 30 days server-side).
  $effect(() => {
    if (auth.authed && !data) load();
  });

  const chartConfig = $derived.by((): ChartConfiguration | null => {
    if (!data) return null;
    return {
      type: 'bar',
      data: {
        labels: data.daily.labels.map((d) => d.slice(5)),
        datasets: PLATFORMS.map((p) => ({ label: p, data: data!.daily.series[p] || [], backgroundColor: COLORS[p], stack: 'r', borderRadius: 3 }))
      },
      options: {
        ...baseOptions(),
        plugins: { ...baseOptions().plugins, tooltip: { callbacks: { label: (c: any) => `${c.dataset.label}: ${taka(c.parsed.y)}` } } },
        scales: stackedBarScales((v) => taka(Number(v)))
      }
    };
  });
</script>

<div class="page-head">
  <div>
    <h1>Reports</h1>
    <div class="sub">Custom date range · totals, fees, and top senders.</div>
  </div>
  <div class="head-actions">
    <button class="btn ghost" onclick={() => auth.logout()}>Sign out</button>
  </div>
</div>

<div class="toolbar">
  <div class="seg">
    <button onclick={() => setPreset(7)}>Last 7 days</button>
    <button onclick={() => setPreset(30)}>Last 30 days</button>
    <button onclick={() => setPreset(90)}>Last 90 days</button>
  </div>
  <input type="date" bind:value={from} />
  <span class="dim">→</span>
  <input type="date" bind:value={to} />
  <button class="btn" onclick={load}>Apply</button>
</div>

{#if data}
  <div class="section-lbl">Totals · {data.from} to {data.to}</div>
  <div class="stats">
    <div class="stat">
      <div class="lbl">All payments</div>
      <div class="num">{fmtCount(data.totals.count)}</div>
      <div class="amt">৳ {fmtAmount(data.totals.amount)}</div>
    </div>
    {#each PLATFORMS as p}
      <div class="stat">
        <div class="lbl"><span class="dot {p}"></span><span>{platformLabel(p)}</span></div>
        <div class="num">{fmtCount(data.totals.byPlatform[p]?.count || 0)}</div>
        <div class="amt">৳ {fmtAmount(data.totals.byPlatform[p]?.amount || 0)}</div>
      </div>
    {/each}
  </div>

  <div class="panel" style="margin:20px 0 26px;">
    <div class="panel-head">
      <h3>Revenue per day</h3>
      <span class="sub">Fees: ৳ {fmtAmount(data.totals.fee)}</span>
    </div>
    {#if chartConfig}<Chart config={chartConfig} />{/if}
  </div>

  <div class="section-lbl">Top senders</div>
  <div class="table-wrap">
    <div class="table-scroll">
      <table>
        <thead><tr><th>Sender</th><th>Transactions</th><th>Amount</th><th></th></tr></thead>
        <tbody>
          {#if !data.topSenders.length}
            <tr><td colspan="4" class="empty">No transactions in this range.</td></tr>
          {:else}
            {#each data.topSenders as s (s.sender)}
              <tr>
                <td class="mono">{s.sender}</td>
                <td class="mono">{fmtCount(s.count)}</td>
                <td class="amt-cell">৳ {fmtAmount(s.amount)}</td>
                <td><a class="btn ghost" href="/transactions?search={encodeURIComponent(s.sender)}">View ›</a></td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
{/if}
