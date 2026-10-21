<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { api } from '$lib/api';
  import { keys } from '$lib/query';
  import { auth } from '$lib/stores/auth.svelte';
  import { PLATFORMS, fmtCount, money, platformLabel } from '$lib/format';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import LoadError from '$lib/components/LoadError.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import SignOutButton from '$lib/components/SignOutButton.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import SkeletonStat from '$lib/components/SkeletonStat.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import UnclaimedRow from '$lib/components/UnclaimedRow.svelte';

  // A window, not a page cursor — see computeUnclaimed() in routes/admin.js for
  // why this list is bounded by date rather than keyset-paged.
  let days = $state('30');
  let platform = $state('all');

  const q = createQuery(() => ({
    queryKey: keys.unclaimed(Number(days), platform),
    queryFn: () => api.unclaimed(Number(days), platform),
    enabled: auth.authed
  }));

  const summary = $derived(q.data?.summary);

  // The ratio is the number worth watching: near 1 once the consuming apps are
  // cut over, far from it while they still verify by reading the database.
  const claimedPct = $derived.by(() => {
    if (!summary?.received) return null;
    return Math.round(((summary.received - summary.count) / summary.received) * 100);
  });

  const meta = $derived(
    summary
      ? `${fmtCount(summary.count)} of ${fmtCount(summary.received)} received · last ${summary.days}d`
      : undefined
  );
</script>

<PageHeader
  title="Unclaimed"
  {meta}
  subtitle="Payments that arrived but no business has claimed — money received that nobody was credited for."
>
  {#snippet actions()}
    <SignOutButton />
  {/snippet}
</PageHeader>

<div class="mt-5 flex flex-wrap items-end gap-4">
  <Segmented
    bind:value={days}
    label="Window"
    options={[
      { value: '7', label: '7 days' },
      { value: '30', label: '30 days' },
      { value: '90', label: '90 days' }
    ]}
  />
  <Segmented
    bind:value={platform}
    label="Platform"
    options={[
      { value: 'all', label: 'All' },
      ...PLATFORMS.map((p) => ({ value: p, label: platformLabel(p) }))
    ]}
  />
</div>

<!-- Until the consuming apps are cut over and history is backfilled, every
     payment looks unclaimed. Say so on the page rather than letting an admin
     read a full list as an emergency. -->
<div class="mt-5 rounded-panel border border-line bg-recessed px-5 py-4 text-small text-ink-mid">
  A payment only counts as claimed once a business redeems it through
  <span class="mono text-ink-body">POST /v1/claims</span>. Until every business is cut over and past
  orders are backfilled, expect this list to be long — it is measuring the gap, not an incident.
</div>

<div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  {#if q.isPending}
    {#each Array(4) as _}<SkeletonStat />{/each}
  {:else if summary}
    <StatCard
      label="Unclaimed"
      count={fmtCount(summary.count)}
      amount={money(summary.amount)}
    />
    <StatCard
      label="Claimed share"
      count={claimedPct === null ? '—' : `${claimedPct}%`}
      amount={`${fmtCount(summary.received)} received`}
    />
    {#each PLATFORMS.filter((p) => summary.byPlatform[p]) as p}
      <StatCard
        label={platformLabel(p)}
        dot={p}
        count={fmtCount(summary.byPlatform[p].count)}
        amount={money(summary.byPlatform[p].amount)}
      />
    {/each}
  {/if}
</div>

<div class="mt-5">
  {#if q.isError}
    <LoadError
      title="Couldn't load unclaimed payments"
      meta="/admin/api/unclaimed"
      onRetry={() => q.refetch()}
    />
  {:else if q.isPending}
    <div class="rounded-panel border border-line bg-panel p-6 shadow-card">
      {#each Array(3) as _}
        <div class="mb-4 last:mb-0"><Skeleton width="100%" height="64px" /></div>
      {/each}
    </div>
  {:else if (q.data?.payments.length ?? 0) === 0}
    <div class="rounded-panel border border-line bg-panel shadow-card">
      <!-- Neutral, not red: every payment being claimed is the goal state, not
           a missing-data problem. -->
      <EmptyState
        align="center"
        title="Every payment is accounted for"
        description="No payment in this window is without a claim."
      />
    </div>
  {:else}
    <div class="overflow-hidden rounded-panel border border-line bg-panel shadow-card">
      {#each q.data!.payments as payment (payment.platform + payment.trxId)}
        <UnclaimedRow {payment} />
      {/each}
    </div>

    {#if q.data!.truncated}
      <div class="mt-4 text-center text-small text-ink-soft">
        Showing the newest {fmtCount(q.data!.payments.length)} of
        {fmtCount(summary!.count)} — narrow the window to see the rest.
      </div>
    {/if}
  {/if}
</div>
