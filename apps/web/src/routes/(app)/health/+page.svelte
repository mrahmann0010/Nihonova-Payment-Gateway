<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { api, type Freshness } from '$lib/api';
  import { createQuery } from '@tanstack/svelte-query';
  import { keys } from '$lib/query';
  import AlertBanner from '$lib/components/AlertBanner.svelte';
  import Button from '$lib/components/Button.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import LoadError from '$lib/components/LoadError.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import ReasonPill from '$lib/components/ReasonPill.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import SignOutButton from '$lib/components/SignOutButton.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import SkeletonStat from '$lib/components/SkeletonStat.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import StatusBadge, { freshnessKind } from '$lib/components/StatusBadge.svelte';
  import { fmtCount, fmtDateTime, platformLabel } from '$lib/format';

  const q = createQuery(() => ({
    queryKey: keys.health,
    queryFn: api.health,
    enabled: auth.authed
  }));
  const data = $derived(q.data ?? null);

  // "Silent" vs "quiet" is the whole job of this page: a platform past 6h is
  // broken and gets a red banner, 2–6h is flagged but not called broken.
  function statusLabel(f: Freshness): string {
    const kind = freshnessKind(f.hoursSince);
    if (kind === 'ok') return 'Receiving';
    if (f.hoursSince == null) return 'Never received';
    const h = Math.round(f.hoursSince);
    return kind === 'warn' ? `Delayed ${h}h` : `Silent ${h}h`;
  }

  const problems = $derived(
    (data?.freshness ?? []).filter((f) => freshnessKind(f.hoursSince) !== 'ok')
  );

  const eventRows = [
    { key: 'unmatched', label: 'Unmatched (no pattern matched)' },
    { key: 'duplicate', label: 'Duplicate (already stored)' },
    { key: 'unknown_sender', label: 'Unknown sender' },
    { key: 'error', label: 'Errors' }
  ] as const;

  const th =
    'px-5 py-3 text-left text-nano font-semibold tracking-[0.05em] text-ink-soft uppercase whitespace-nowrap';
  const td = 'px-5 py-3 align-top';
</script>

<PageHeader
  title="Pipeline health"
  subtitle="Is every SMS actually making it into the database?"
>
  {#snippet actions()}
    <Button variant="primary" disabled={q.isFetching} onclick={() => q.refetch()}>
      {q.isFetching ? 'Refreshing…' : 'Refresh'}
    </Button>
    <SignOutButton />
  {/snippet}
</PageHeader>

{#if q.isError}
  <LoadError title="Couldn't load pipeline health" meta="/admin/api/health" onRetry={() => q.refetch()} />
{:else}
  {#if problems.length}
    <div class="flex flex-col gap-3">
      {#each problems as f (f.name)}
        {@const kind = freshnessKind(f.hoursSince)}
        <AlertBanner
          kind={kind === 'down' ? 'down' : 'warn'}
          title="{platformLabel(f.name)} — {statusLabel(f)}"
          description={f.lastReceivedAt
            ? `Last SMS ${fmtDateTime(f.lastReceivedAt)}. ${
                kind === 'down'
                  ? 'This is not a quiet day — the forwarder likely stopped.'
                  : "Between 2–6h we flag it but don't call it broken."
              }`
            : 'Nothing has ever been received from this platform.'}
        />
      {/each}
    </div>
  {/if}

  <section>
    <SectionHeading title="Freshness" note="last SMS received, per platform" />
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#if q.isPending}
        {#each Array(3) as _}<SkeletonStat delta={false} />{/each}
      {:else if data}
        {#each data.freshness as f (f.name)}
          <StatCard
            label={platformLabel(f.name)}
            dot={f.name}
            amount={f.lastReceivedAt ? fmtDateTime(f.lastReceivedAt) : 'No payments recorded'}
          >
            {#snippet value()}
              <StatusBadge kind={freshnessKind(f.hoursSince)} label={statusLabel(f)} />
            {/snippet}
          </StatCard>
        {/each}
      {/if}
    </div>
  </section>

  <section>
    <SectionHeading title="Ingestion events" note="messages that arrived but didn't become a payment" />
    <div class="grid gap-5 md:grid-cols-2">
      {#each [{ title: 'Last 24 hours', counts: data?.counts24h }, { title: 'Last 7 days', counts: data?.counts7d }] as block (block.title)}
        <Panel title={block.title}>
          <div class="flex flex-col">
            {#each eventRows as row (row.key)}
              <div
                class="flex items-center justify-between gap-4 border-b border-line-faint py-2.5 last:border-b-0"
              >
                <span class="text-ident text-ink-mid">{row.label}</span>
                {#if block.counts}
                  <span class="mono text-ident font-medium">{fmtCount(block.counts[row.key])}</span>
                {:else}
                  <Skeleton width="28px" height="12px" />
                {/if}
              </div>
            {/each}
          </div>
        </Panel>
      {/each}
    </div>
  </section>

  <section>
    <SectionHeading title="Recent events" note="most recent ingestion problems, newest first" />
    <div class="overflow-hidden rounded-panel border border-line bg-panel shadow-card">
      {#if q.isPending}
        {#each Array(5) as _}
          <div class="flex items-center gap-4 border-b border-line-faint px-5 py-3.5">
            <Skeleton width="90px" height="22px" round="full" />
            <Skeleton width="40%" height="12px" />
            <Skeleton width="120px" height="12px" />
          </div>
        {/each}
      {:else if !data?.recentEvents.length}
        <EmptyState
          align="center"
          icon="check"
          title="No ingestion issues recorded"
          description="Every message the gateway received parsed into a payment."
        />
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b border-line-soft bg-recessed">
                <th class={th}>Reason</th>
                <th class={th}>Platform</th>
                <th class={th}>Sender</th>
                <th class={th}>Detail</th>
                <th class={th}>Time</th>
              </tr>
            </thead>
            <tbody>
              {#each data.recentEvents as e, i (e.createdAt + i)}
                <tr class="border-b border-line-faint last:border-b-0">
                  <td class={td}><ReasonPill reason={e.reason} /></td>
                  <td class="{td} mono text-label {e.platform ? 'text-ink-mid' : 'text-ink-faint'}">
                    {e.platform ? platformLabel(e.platform) : '—'}
                  </td>
                  <td class="{td} mono text-label {e.sender ? '' : 'text-ink-faint'}">
                    {e.sender || '—'}
                  </td>
                  <td class="{td} mono max-w-90 text-label break-words text-ink-mid">
                    {(e.error || e.rawMessage || '—').slice(0, 120)}
                  </td>
                  <td class="{td} mono text-label whitespace-nowrap text-ink-mid">
                    {fmtDateTime(e.createdAt)}
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
