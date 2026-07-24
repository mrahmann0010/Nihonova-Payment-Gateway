<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { api } from '$lib/api';
  import { createQuery } from '@tanstack/svelte-query';
  import { keys } from '$lib/query';
  import Chart from '$lib/Chart.svelte';
  import Skeleton from '$lib/Skeleton.svelte';
  import SkeletonStat from '$lib/SkeletonStat.svelte';
  import { baseOptions, stackedBarScales } from '$lib/chartOpts';
  import { COLORS, PLATFORMS, fmtAmount, fmtCount, taka, platformLabel } from '$lib/format';
  import type { ChartConfiguration } from 'chart.js';

  // `from`/`to` back the date inputs; `applied` is the committed range that
  // actually drives the query (updated on Apply / preset click).
  let from = $state('');
  let to = $state('');
  let applied = $state({ from: '', to: '' });

  const q = createQuery(() => ({
    queryKey: keys.reports(applied.from, applied.to),
    queryFn: () => api.reports(applied.from || undefined, applied.to || undefined),
    enabled: auth.authed
  }));
  const data = $derived(q.data ?? null);
  const loading = $derived(q.isFetching);

  // Mirror the server-resolved range back into the pickers (initial defaults).
  $effect(() => {
    if (q.data) { from = q.data.from; to = q.data.to; }
  });

  function load() {
    applied = { from, to };
  }

  function setPreset(days: number) {
    const t = new Date();
    const f = new Date();
    f.setDate(f.getDate() - (days - 1));
    to = t.toISOString().slice(0, 10);
    from = f.toISOString().slice(0, 10);
    load();
  }

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
  <button class="btn" onclick={load} disabled={loading}>{loading ? 'Loading…' : 'Apply'}</button>
</div>

{#if !data && loading}
  <div class="section-lbl"><Skeleton width="180px" height="0.8rem" /></div>
  <div class="stats">
    {#each Array(4) as _}<SkeletonStat />{/each}
  </div>
  <div class="panel" style="margin:20px 0 26px;">
    <div style="margin-bottom:14px;"><Skeleton width="30%" height="1rem" /></div>
    <Skeleton width="100%" height="280px" radius="8px" />
  </div>
{:else if data}
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
