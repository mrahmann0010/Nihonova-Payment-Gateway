<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { api, type Health } from '$lib/api';
  import { fmtAgo, fmtDateTime, platformLabel } from '$lib/format';

  let data = $state<Health | null>(null);

  async function load() {
    if (!auth.token) return;
    data = await api.health(auth.token);
  }

  $effect(() => {
    if (auth.token && !data) load();
  });

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
    <button class="btn ghost" onclick={load}>Refresh</button>
    <button class="btn ghost" onclick={() => auth.logout()}>Sign out</button>
  </div>
</div>

{#if data}
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
