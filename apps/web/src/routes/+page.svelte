<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { api } from '$lib/api';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { keys } from '$lib/query';
  import Button from '$lib/components/Button.svelte';
  import Chart from '$lib/components/Chart.svelte';
  import ChartPanel from '$lib/components/ChartPanel.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import Field from '$lib/components/Field.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import LoadError from '$lib/components/LoadError.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PlatformDot from '$lib/components/PlatformDot.svelte';
  import PlatformPill from '$lib/components/PlatformPill.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import SignOutButton from '$lib/components/SignOutButton.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import SkeletonStat from '$lib/components/SkeletonStat.svelte';
  import StatCard, { type Delta } from '$lib/components/StatCard.svelte';
  import { axisStrip, baseOptions, plainBarScales, stackedBarScales } from '$lib/chartOpts';
  import {
    ACCENT,
    COLORS,
    PLATFORMS,
    fmtAgeShort,
    fmtAgo,
    fmtCount,
    fmtDateTime,
    money,
    platformLabel,
    taka
  } from '$lib/format';
  import type { ChartConfiguration } from 'chart.js';

  const client = useQueryClient();

  // Polled in the background by TanStack Query — new records show up on their own.
  const statsQuery = createQuery(() => ({
    queryKey: keys.stats,
    queryFn: api.stats,
    enabled: auth.authed
  }));
  const stats = $derived(statsQuery.data ?? null);
  const statsLoading = $derived(!stats && statsQuery.isPending);
  // A background refetch over data that's already on screen: an indeterminate
  // bar, not a skeleton — the numbers below stay readable while it runs.
  const refreshing = $derived(statsQuery.isFetching && !statsQuery.isPending);

  const updated = $derived(
    statsQuery.dataUpdatedAt
      ? 'Updated ' + new Date(statsQuery.dataUpdatedAt).toLocaleTimeString('en-US')
      : 'Loading…'
  );

  // Latest transaction + the five behind it (payments, limit 6).
  const recentParams = { platform: 'all', page: 1, limit: 6 };
  const recentQuery = createQuery(() => ({
    queryKey: keys.payments(recentParams),
    queryFn: () => api.payments(recentParams),
    enabled: auth.authed
  }));
  const recent = $derived(recentQuery.data?.payments ?? []);
  const latest = $derived(recent[0]);
  const earlier = $derived(recent.slice(1));
  let showEarlier = $state(false);

  // Past 6 hours with nothing arriving is not a quiet day — it's a stopped
  // forwarder, and it has to read as broken rather than as an empty state.
  const silentHours = $derived(
    latest ? (Date.now() - new Date(latest.dateReceived).getTime()) / 3_600_000 : null
  );
  const silent = $derived(silentHours != null && silentHours > 6 ? Math.round(silentHours) : null);

  function delta(curr: number, prev: number, label: string): Delta | null {
    // No prior revenue means there's nothing to compare against — the card
    // keeps an empty delta slot rather than claiming a meaningless +100%.
    if (!prev) return null;
    const pct = Math.round(((curr - prev) / prev) * 100);
    return { dir: pct >= 0 ? 'up' : 'down', txt: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs ${label}` };
  }

  const overviewCards = $derived.by(() => {
    const p = stats?.periods;
    if (!p) return [];
    return [
      { label: 'Today', count: p.today.count, amount: p.today.amount, delta: delta(p.today.amount, p.yesterday.amount, 'yesterday') },
      { label: 'Yesterday', count: p.yesterday.count, amount: p.yesterday.amount, delta: null },
      { label: 'Last 7 days', count: p.last7.count, amount: p.last7.amount, delta: delta(p.last7.amount, p.prev7.amount, 'prior 7 days') },
      { label: 'This month', count: p.month.count, amount: p.month.amount, delta: delta(p.month.amount, p.prevMonthSame.amount, 'last month') }
    ];
  });

  const allTimeCards = $derived.by(() => {
    if (!stats) return [];
    const by = stats.totals.byPlatform || {};
    return [
      { label: 'All payments', dot: undefined, count: stats.totals.count, amount: stats.totals.amount },
      ...PLATFORMS.map((p) => ({
        label: platformLabel(p),
        dot: p as string,
        count: by[p]?.count || 0,
        amount: by[p]?.amount || 0
      }))
    ];
  });

  // ---- Share by platform (donut + legend rows) ----
  const shareRows = $derived.by(() => {
    if (!stats) return [];
    const by = stats.totals.byPlatform || {};
    const total = PLATFORMS.reduce((a, p) => a + (by[p]?.count || 0), 0);
    return PLATFORMS.map((p) => {
      const count = by[p]?.count || 0;
      return {
        platform: p as string,
        label: platformLabel(p),
        count,
        pct: total ? ((count / total) * 100).toFixed(1) + '%' : '—'
      };
    });
  });

  // ---- 14-day revenue roll-up for the dark summary card ----
  const revenue14 = $derived.by(() => {
    if (!stats) return null;
    const series = stats.revenue.series || {};
    const sum = (xs: number[] = []) => xs.reduce((a, b) => a + b, 0);
    return {
      total: sum(stats.revenue.total),
      days: stats.revenue.labels.length,
      split: PLATFORMS.map((p) => ({ platform: p as string, label: platformLabel(p), amount: sum(series[p]) }))
    };
  });

  // ---- Chart configs ----
  function stacked(
    src: { labels: string[]; series: Record<string, number[]> } | undefined,
    stack: string,
    asMoney: boolean
  ): ChartConfiguration | null {
    if (!src) return null;
    const opts = baseOptions();
    return {
      type: 'bar',
      data: {
        labels: src.labels,
        datasets: PLATFORMS.map((p) => ({
          label: platformLabel(p),
          data: src.series[p] || [],
          backgroundColor: COLORS[p],
          stack,
          borderRadius: 3
        }))
      },
      options: asMoney
        ? {
            ...opts,
            plugins: {
              ...opts.plugins,
              tooltip: {
                ...opts.plugins?.tooltip,
                callbacks: { label: (c: any) => `${c.dataset.label}: ${taka(c.parsed.y)}` }
              }
            },
            scales: stackedBarScales((v) => taka(Number(v)))
          }
        : { ...opts, scales: stackedBarScales() }
    };
  }

  const trendConfig = $derived(stacked(stats?.daily, 's', false));
  const revenueConfig = $derived(stacked(stats?.revenue, 'r', true));

  const shareConfig = $derived.by((): ChartConfiguration | null => {
    if (!stats) return null;
    const by = stats.totals.byPlatform || {};
    return {
      type: 'doughnut',
      data: {
        labels: PLATFORMS.map(platformLabel),
        datasets: [
          {
            data: PLATFORMS.map((p) => by[p]?.count || 0),
            backgroundColor: PLATFORMS.map((p) => COLORS[p]),
            borderColor: '#FFFFFF',
            borderWidth: 3
          }
        ]
      },
      options: { ...baseOptions<'doughnut'>(), cutout: '62%' } as ChartConfiguration['options']
    };
  });

  const peakConfig = $derived.by((): ChartConfiguration | null => {
    if (!stats) return null;
    return {
      type: 'bar',
      data: {
        labels: stats.peakHours.labels.map((h) => String(h).padStart(2, '0')),
        datasets: [{ label: 'Payments', data: stats.peakHours.counts, backgroundColor: ACCENT, borderRadius: 3 }]
      },
      options: { ...baseOptions(), scales: plainBarScales() }
    };
  });

  // Axis strips: the plots draw no x labels of their own.
  const dailyAxis = $derived(axisStrip((stats?.daily.labels ?? []).map((d) => d.slice(5))));
  const revenueAxis = $derived(axisStrip((stats?.revenue.labels ?? []).map((d) => d.slice(5))));
  const peakAxis = $derived(
    axisStrip((stats?.peakHours.labels ?? []).map((h) => String(h).padStart(2, '0')), 7)
  );
</script>

<PageHeader title="Dashboard" meta={updated}>
  {#snippet actions()}
    <Button variant="primary" onclick={() => client.invalidateQueries()}>Refresh</Button>
    <SignOutButton />
  {/snippet}
</PageHeader>

{#if refreshing}
  <div class="-mt-6"><ProgressBar label="Refreshing…" /></div>
{/if}

<!-- ============ LATEST TRANSACTION ============ -->
<section>
  <SectionHeading title="Latest transaction" linkLabel="All transactions" linkHref="/transactions" />

  {#if recentQuery.isError}
    <LoadError
      title="Couldn't load recent payments"
      meta="/admin/api/payments"
      onRetry={() => recentQuery.refetch()}
    />
  {:else}
    {#if silent}
      <div class="mb-4">
        <ErrorState
          title="No SMS received in {silent} hours"
          description="This is not a quiet day — the forwarder likely stopped. Check the device."
        />
      </div>
    {/if}
    <div class="overflow-hidden rounded-panel border border-line bg-panel shadow-lifted">
      <div class="px-7 py-6.5">
        {#if recentQuery.isPending}
          <Skeleton width="220px" height="14px" />
          <div class="mt-5 flex items-center gap-4">
            <Skeleton width="86px" height="28px" round="full" />
            <Skeleton width="180px" height="34px" />
          </div>
          <div class="mt-5.5 flex gap-10 border-t border-line-soft pt-4.5">
            <Skeleton width="110px" height="30px" />
            <Skeleton width="110px" height="30px" />
            <Skeleton width="110px" height="30px" />
          </div>
        {:else if !latest}
          <EmptyState
            align="center"
            title="No payments yet"
            description="Nothing has been forwarded to the gateway so far. The pipeline is healthy — there's simply nothing to show."
          />
        {:else}
          <div class="mb-5 flex flex-wrap items-baseline gap-3">
            <span class="text-body font-semibold">{fmtAgo(latest.dateReceived)}</span>
            <span class="mono text-small text-ink-soft">
              {fmtDateTime(latest.dateReceived)} · Asia/Dhaka
            </span>
          </div>
          <div class="mb-5.5 flex flex-wrap items-center gap-4">
            <PlatformPill platform={latest.platform} />
            <span class="mono text-hero font-semibold tracking-[-0.01em] text-money">
              {money(latest.amount)}
            </span>
          </div>
          <div class="flex flex-wrap gap-x-10 gap-y-4 border-t border-line-soft pt-4.5">
            <Field label="TrxID" value={latest.trxId} strong />
            <Field label="Sender" value={latest.sender} strong />
            <Field label="Reference" value={latest.ref} />
          </div>
        {/if}
      </div>

      {#if earlier.length}
        <button
          type="button"
          class="flex w-full cursor-pointer items-center justify-between border-t border-line-soft bg-recessed px-7 py-3.25 text-left hover:bg-sunken"
          onclick={() => (showEarlier = !showEarlier)}
        >
          <span class="text-label font-semibold text-ink-deep">
            {showEarlier ? 'Hide earlier payments' : `Show ${earlier.length} earlier payments`}
          </span>
          <span class="text-accent">
            <Icon name="chevron-down" size={16} stroke={2.4} />
          </span>
        </button>

        {#if showEarlier}
          <div>
            <div
              class="grid grid-cols-[88px_1fr_100px_56px] gap-3 border-b border-line-soft bg-sunken px-7 py-2.75 text-micro font-semibold tracking-[0.05em] text-ink-soft uppercase"
            >
              <span>Platform</span>
              <span>TrxID</span>
              <span class="text-right">Amount</span>
              <span class="text-right">Ago</span>
            </div>
            {#each earlier as r (r.platform + r.trxId)}
              <div
                class="grid grid-cols-[88px_1fr_100px_56px] items-center gap-3 border-b border-line-faint px-7 py-3 last:border-b-0"
              >
                <PlatformPill platform={r.platform} size="sm" />
                <span class="mono truncate text-label">{r.trxId}</span>
                <span class="mono text-right text-label text-money">{money(r.amount)}</span>
                <span class="mono text-right text-meta text-ink-dim">
                  {fmtAgeShort(r.dateReceived)}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</section>

<!-- ============ OVERVIEW ============ -->
<section>
  <SectionHeading title="Overview" note="count and total, with change vs the prior period" />
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#if statsLoading}
      {#each Array(4) as _}<SkeletonStat />{/each}
    {:else}
      {#each overviewCards as c (c.label)}
        <StatCard
          label={c.label}
          count={fmtCount(c.count)}
          amount={money(c.amount)}
          delta={c.delta}
        />
      {/each}
    {/if}
  </div>
</section>

<!-- ============ ALL-TIME ============ -->
<section>
  <SectionHeading title="All-time totals" note="lifetime, no date bound" />
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#if statsLoading}
      {#each Array(4) as _}<SkeletonStat delta={false} />{/each}
    {:else}
      {#each allTimeCards as c (c.label)}
        <StatCard label={c.label} dot={c.dot} count={fmtCount(c.count)} amount={money(c.amount)} />
      {/each}
    {/if}
  </div>
</section>

<!-- ============ CHART ROW A ============ -->
<div class="grid gap-5 lg:grid-cols-[1.75fr_1fr]">
  <ChartPanel
    title="Payments per day"
    subtitle="Last 14 days · stacked by platform · zero days included"
    legend
    height={230}
    axis={dailyAxis}
  >
    {#if trendConfig}<Chart config={trendConfig} />{:else}<Skeleton width="100%" height="230px" />{/if}
  </ChartPanel>

  <ChartPanel title="Share by platform" subtitle="All-time transaction count" height={180}>
    {#if shareConfig}<Chart config={shareConfig} />{:else}<Skeleton width="100%" height="180px" />{/if}

    {#snippet footer()}
      <div class="flex flex-col gap-2.25">
        {#each shareRows as r (r.platform)}
          <div class="flex items-center gap-2.5">
            <PlatformDot platform={r.platform} />
            <span class="flex-1 text-label font-semibold">{r.label}</span>
            <span class="mono text-small text-ink-soft">{fmtCount(r.count)}</span>
            <span class="mono w-11 text-right text-label font-semibold">{r.pct}</span>
          </div>
        {/each}
      </div>
    {/snippet}
  </ChartPanel>
</div>

<!-- ============ CHART ROW B ============ -->
<div class="grid gap-5 lg:grid-cols-[1.75fr_1fr]">
  <ChartPanel
    title="Revenue per day"
    subtitle="Last 14 days · taka, stacked by platform"
    legend
    height={230}
    axis={revenueAxis}
  >
    {#if revenueConfig}<Chart config={revenueConfig} />{:else}<Skeleton width="100%" height="230px" />{/if}
  </ChartPanel>

  <div class="flex flex-col justify-between gap-6 rounded-panel bg-ink px-6.5 py-6 text-white">
    <div class="text-ident font-semibold text-on-ink">14-day revenue</div>
    {#if revenue14}
      <div>
        <div class="mono text-display leading-none font-semibold tracking-[-0.02em]">
          {taka(revenue14.total)}
        </div>
        <div class="mt-2 text-ctl text-on-ink">across {revenue14.days} days</div>
      </div>
      <div class="flex flex-col gap-2.5 border-t border-on-ink-line pt-4.5">
        {#each revenue14.split as s (s.platform)}
          <div class="flex items-center gap-2.25">
            <PlatformDot platform={s.platform} size="sm" />
            <span class="flex-1 text-label text-on-ink">{s.label}</span>
            <span class="mono text-label">{taka(s.amount)}</span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="text-ctl text-on-ink">Loading…</div>
    {/if}
  </div>
</div>

<!-- ============ PEAK HOURS ============ -->
<ChartPanel
  title="Peak hours"
  subtitle="Transactions by hour of day, last 30 days · Bangladesh time"
  height={170}
  axis={peakAxis}
>
  {#if peakConfig}<Chart config={peakConfig} />{:else}<Skeleton width="100%" height="170px" />{/if}
</ChartPanel>
