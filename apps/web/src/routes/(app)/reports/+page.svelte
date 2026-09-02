<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { api } from '$lib/api';
  import { createQuery } from '@tanstack/svelte-query';
  import { keys } from '$lib/query';
  import Button from '$lib/components/Button.svelte';
  import Chart from '$lib/components/Chart.svelte';
  import ChartPanel from '$lib/components/ChartPanel.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Input from '$lib/components/Input.svelte';
  import LoadError from '$lib/components/LoadError.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PlatformDot from '$lib/components/PlatformDot.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import SignOutButton from '$lib/components/SignOutButton.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import SkeletonStat from '$lib/components/SkeletonStat.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import { axisStrip, baseOptions, stackedBarScales } from '$lib/chartOpts';
  import { COLORS, PLATFORMS, fmtCount, money, platformLabel, taka } from '$lib/format';
  import type { ChartConfiguration } from 'chart.js';

  // `from`/`to` back the date inputs; `applied` is the committed range that
  // actually drives the query (updated on Apply / preset click).
  let from = $state('');
  let to = $state('');
  let applied = $state({ from: '', to: '' });
  let preset = $state('');

  const PRESETS = [
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
    { value: '90', label: '90 days' }
  ];

  const q = createQuery(() => ({
    queryKey: keys.reports(applied.from, applied.to),
    queryFn: () => api.reports(applied.from || undefined, applied.to || undefined),
    enabled: auth.authed
  }));
  const data = $derived(q.data ?? null);

  // Mirror the server-resolved range back into the pickers (initial defaults).
  $effect(() => {
    if (q.data) {
      from = q.data.from;
      to = q.data.to;
    }
  });

  function load() {
    preset = '';
    applied = { from, to };
  }

  function applyPreset(days: string) {
    const t = new Date();
    const f = new Date();
    f.setDate(f.getDate() - (Number(days) - 1));
    to = t.toISOString().slice(0, 10);
    from = f.toISOString().slice(0, 10);
    applied = { from, to };
    preset = days;
  }

  const chartConfig = $derived.by((): ChartConfiguration | null => {
    if (!data) return null;
    const opts = baseOptions();
    return {
      type: 'bar',
      data: {
        labels: data.daily.labels,
        datasets: PLATFORMS.map((p) => ({
          label: platformLabel(p),
          data: data.daily.series[p] || [],
          backgroundColor: COLORS[p],
          stack: 'r',
          borderRadius: 3
        }))
      },
      options: {
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
    };
  });

  const chartAxis = $derived(axisStrip((data?.daily.labels ?? []).map((d) => d.slice(5))));

  const th =
    'px-5 py-3 text-left text-nano font-semibold tracking-[0.05em] text-ink-soft uppercase whitespace-nowrap';
  const td = 'px-5 py-3 whitespace-nowrap';
</script>

<PageHeader title="Reports" subtitle="Custom date range · totals, fees, and top senders.">
  {#snippet actions()}
    <SignOutButton />
  {/snippet}
</PageHeader>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center gap-3">
    <Segmented
      value={preset}
      options={PRESETS}
      label="Preset range"
      onchange={applyPreset}
    />
    <div class="flex flex-1 flex-wrap items-center gap-2.5">
      <div class="min-w-38 flex-1"><Input bind:value={from} type="date" label="From" /></div>
      <span class="text-ink-soft">→</span>
      <div class="min-w-38 flex-1"><Input bind:value={to} type="date" label="To" /></div>
      <Button variant="primary" disabled={q.isFetching} onclick={load}>
        {q.isFetching ? 'Loading…' : 'Apply range'}
      </Button>
    </div>
  </div>

  {#if q.isError}
    <LoadError title="Couldn't load this report" meta="/admin/api/reports" onRetry={() => q.refetch()} />
  {:else}
    <section>
      <SectionHeading
        title="Totals"
        note={data ? `${data.from} to ${data.to}` : 'resolving range…'}
      />
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {#if !data}
          {#each Array(4) as _}<SkeletonStat delta={false} />{/each}
        {:else}
          <StatCard
            label="All payments"
            count={fmtCount(data.totals.count)}
            amount={money(data.totals.amount)}
          />
          {#each PLATFORMS as p (p)}
            <StatCard
              label={platformLabel(p)}
              dot={p}
              count={fmtCount(data.totals.byPlatform[p]?.count || 0)}
              amount={money(data.totals.byPlatform[p]?.amount || 0)}
            />
          {/each}
        {/if}
      </div>
    </section>

    <ChartPanel
      title="Revenue per day"
      subtitle={data
        ? `${data.from} to ${data.to} · fees ${money(data.totals.fee)}`
        : 'stacked by platform'}
      legend
      height={230}
      axis={chartAxis}
    >
      {#if chartConfig}<Chart config={chartConfig} />{:else}<Skeleton width="100%" height="230px" />{/if}
    </ChartPanel>

    <section>
      <SectionHeading title="Customers" note="unique senders in the range" />
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {#if !data}
          {#each Array(4) as _}<SkeletonStat delta={false} />{/each}
        {:else}
          <StatCard
            label="Unique customers"
            count={fmtCount(data.customers.total)}
            amount="distinct senders"
          />
          <StatCard
            label="Returning"
            dot="returning"
            count={fmtCount(data.customers.returning)}
            amount="seen before this range"
          />
          <StatCard
            label="New"
            dot="new"
            count={fmtCount(data.customers.new)}
            amount="first seen in range"
          />
          <StatCard
            label="Recurring rate"
            count={`${data.customers.returningPct}%`}
            amount="of unique customers"
          />
        {/if}
      </div>

      {#if data?.customers.total}
        <div
          class="mt-4 flex h-3 overflow-hidden rounded-full bg-fill-deep"
          role="img"
          aria-label="{data.customers.returningPct}% returning, {100 -
            data.customers.returningPct}% new"
        >
          <div class="bg-money" style="width:{data.customers.returningPct}%"></div>
          <div class="bg-accent" style="width:{100 - data.customers.returningPct}%"></div>
        </div>
        <div class="mt-2.5 flex gap-4.5 text-label text-ink-mid">
          <span class="inline-flex items-center gap-1.5">
            <PlatformDot platform="returning" /> Returning {data.customers.returningPct}%
          </span>
          <span class="inline-flex items-center gap-1.5">
            <PlatformDot platform="new" /> New {100 - data.customers.returningPct}%
          </span>
        </div>
      {/if}
    </section>

    <section>
      <SectionHeading title="Top senders" note="highest total value in the range" />
      <div class="overflow-hidden rounded-panel border border-line bg-panel shadow-card">
        {#if !data}
          {#each Array(5) as _}
            <div class="flex items-center gap-4 border-b border-line-faint px-5 py-3.5">
              <Skeleton width="120px" height="12px" />
              <Skeleton width="40px" height="12px" />
              <Skeleton width="100px" height="12px" />
            </div>
          {/each}
        {:else if !data.topSenders.length}
          <EmptyState
            align="center"
            title="No payments in this range"
            description="Widen the dates, or pick one of the presets above."
          />
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full border-collapse">
              <thead>
                <tr class="border-b border-line-soft bg-recessed">
                  <th class={th}>Sender</th>
                  <th class="{th} text-right!">Transactions</th>
                  <th class="{th} text-right!">Amount</th>
                  <th class={th}></th>
                </tr>
              </thead>
              <tbody>
                {#each data.topSenders as s (s.sender)}
                  <tr class="border-b border-line-faint last:border-b-0 hover:bg-recessed">
                    <td class="{td} mono text-label font-medium">{s.sender}</td>
                    <td class="{td} mono text-right text-label text-ink-mid">{fmtCount(s.count)}</td>
                    <td class="{td} mono text-right text-label text-money">{money(s.amount)}</td>
                    <td class="{td} text-right">
                      <a
                        href="/transactions?search={encodeURIComponent(s.sender)}"
                        class="text-label font-semibold">View ›</a
                      >
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </section>
  {/if}
</div>
