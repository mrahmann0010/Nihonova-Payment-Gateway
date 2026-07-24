<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { api } from '$lib/api';
  import { createQuery } from '@tanstack/svelte-query';
  import { keys } from '$lib/query';
  import Skeleton from '$lib/Skeleton.svelte';
  import SkeletonStat from '$lib/SkeletonStat.svelte';
  import { fmtAgo, fmtDateTime, platformLabel } from '$lib/format';

  const q = createQuery(() => ({
    queryKey: keys.health,
    queryFn: api.health,
    enabled: auth.authed
  }));
  const data = $derived(q.data ?? null);
  const loading = $derived(q.isFetching);

  function load() {
    q.refetch();
  }

  function freshnessStatus(hoursSince: number | null): string {
    if (hoursSince == null) return 'down';
    if (hoursSince < 2) return 'ok';
    if (hoursSince < 6) return 'warn';
    return 'down';
  }
</script>

<div class="page-head">
  <div>
    <h1>Pipeline health</h1>
    <div class="sub">Is every SMS actually making it into the database?</div>
  </div>
  <div class="head-actions">
    <button class="btn ghost" onclick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
    <button class="btn ghost" onclick={() => auth.logout()}>Sign out</button>
  </div>
</div>

{#if !data && loading}
  <div class="section-lbl"><Skeleton width="220px" height="0.8rem" /></div>
  <div class="stats">
    {#each Array(3) as _}<SkeletonStat />{/each}
  </div>
  <div class="section-lbl"><Skeleton width="140px" height="0.8rem" /></div>
  <div class="charts">
    <div class="panel"><Skeleton width="40%" height="1rem" /><div style="margin-top:14px;"><Skeleton width="100%" height="120px" radius="8px" /></div></div>
    <div class="panel"><Skeleton width="40%" height="1rem" /><div style="margin-top:14px;"><Skeleton width="100%" height="120px" radius="8px" /></div></div>
  </div>
{:else if data}
  <div class="section-lbl">Freshness · last received per platform</div>
  <div class="stats">
    {#each data.freshness as f}
      {@const status = freshnessStatus(f.hoursSince)}
      <div class="stat">
        <div class="lbl"><span class="dot {f.name}"></span>{platformLabel(f.name)}</div>
        <div class="num status-{status}">{f.lastReceivedAt ? fmtAgo(f.lastReceivedAt) : 'Never'}</div>
        <div class="amt">{f.lastReceivedAt ? fmtDateTime(f.lastReceivedAt) : 'No transactions recorded'}</div>
      </div>
    {/each}
  </div>

  <div class="section-lbl">Ingestion events</div>
  <div class="charts">
    <div class="panel">
      <h3>Last 24 hours</h3>
      <table class="kv">
        <tbody>
          <tr><td>Unmatched (no pattern matched)</td><td class="mono">{data.counts24h.unmatched}</td></tr>
          <tr><td>Duplicate (already stored)</td><td class="mono">{data.counts24h.duplicate}</td></tr>
          <tr><td>Unknown sender</td><td class="mono">{data.counts24h.unknown_sender}</td></tr>
          <tr><td>Errors</td><td class="mono">{data.counts24h.error}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="panel">
      <h3>Last 7 days</h3>
      <table class="kv">
        <tbody>
          <tr><td>Unmatched</td><td class="mono">{data.counts7d.unmatched}</td></tr>
          <tr><td>Duplicate</td><td class="mono">{data.counts7d.duplicate}</td></tr>
          <tr><td>Unknown sender</td><td class="mono">{data.counts7d.unknown_sender}</td></tr>
          <tr><td>Errors</td><td class="mono">{data.counts7d.error}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section-lbl">Recent events</div>
  <div class="table-wrap">
    <div class="table-scroll">
      <table>
        <thead><tr><th>Reason</th><th>Platform</th><th>Sender</th><th>Detail</th><th>Time</th></tr></thead>
        <tbody>
          {#if !data.recentEvents.length}
            <tr><td colspan="5" class="empty">No ingestion issues recorded — pipeline's been clean.</td></tr>
          {:else}
            {#each data.recentEvents as e}
              <tr>
                <td><span class="pill reason-{e.reason}">{e.reason.replace('_', ' ')}</span></td>
                <td class="mono dim">{e.platform || '—'}</td>
                <td class="mono">{e.sender || '—'}</td>
                <td class="mono dim">{(e.error || e.rawMessage || '—').slice(0, 60)}</td>
                <td class="mono dim">{fmtDateTime(e.createdAt)}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
{/if}
