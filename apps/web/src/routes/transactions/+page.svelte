<script lang="ts">
  import { page } from '$app/state';
  import { auth } from '$lib/stores/auth.svelte';
  import { api, type Payment } from '$lib/api';
  import { fmtAmount, fmtDateTime, platformLabel } from '$lib/format';

  const PLATFORM_TABS = ['all', 'bkash', 'nagad', 'rocket'];
  const LIMIT = 20;

  let platform = $state('all');
  let search = $state(page.url.searchParams.get('search') ?? '');
  let rows = $state<Payment[]>([]);
  let total = $state(0);
  let currentPage = $state(1);
  let pages = $state(1);
  let loading = $state(false);

  // Load page 1 for the current platform/search (resets the list).
  async function loadFirst() {
    if (!auth.authed) return;
    loading = true;
    try {
      const r = await api.payments({ platform, search, page: 1, limit: LIMIT });
      rows = r.payments;
      total = r.total;
      pages = r.pages;
      currentPage = 1;
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (loading || currentPage >= pages || !auth.authed) return;
    loading = true;
    try {
      const r = await api.payments({ platform, search, page: currentPage + 1, limit: LIMIT });
      rows = [...rows, ...r.payments];
      currentPage = r.page;
      pages = r.pages;
    } finally {
      loading = false;
    }
  }

  // Reload whenever platform or (debounced) search changes.
  let debounce: ReturnType<typeof setTimeout>;
  $effect(() => {
    // reference reactive deps
    platform;
    search;
    auth.authed;
    clearTimeout(debounce);
    debounce = setTimeout(loadFirst, 300);
    return () => clearTimeout(debounce);
  });

  // Infinite scroll: observe the sentinel row.
  let sentinel = $state<HTMLElement>();
  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    });
    io.observe(sentinel);
    return () => io.disconnect();
  });
</script>

<div class="page-head">
  <div>
    <h1>Transactions</h1>
    <div class="sub">Filter, search, and scroll through every record.</div>
  </div>
  <div class="head-actions">
    <button class="btn ghost" onclick={() => auth.logout()}>Sign out</button>
  </div>
</div>

<div class="toolbar">
  <div class="seg">
    {#each PLATFORM_TABS as p}
      <button class:active={platform === p} onclick={() => (platform = p)}>
        {p === 'all' ? 'All' : platformLabel(p)}
      </button>
    {/each}
  </div>
  <div class="search">
    <input type="text" placeholder="Search trxId or sender…" bind:value={search} />
  </div>
</div>

<div class="table-wrap">
  <div class="info-row">{total.toLocaleString()} record{total === 1 ? '' : 's'}</div>
  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th>Platform</th><th>TrxID</th><th>Amount</th><th>Sender</th>
          <th>Fee</th><th>Balance</th><th>Ref</th><th>Date · time</th><th>SIM</th>
        </tr>
      </thead>
      <tbody>
        {#if !rows.length && !loading}
          <tr><td colspan="9" class="empty">No payments found.</td></tr>
        {:else}
          {#each rows as p (p.platform + p.trxId)}
            <tr>
              <td><span class="pill {p.platform}">{p.platform}</span></td>
              <td class="mono">{p.trxId}</td>
              <td class="amt-cell">৳ {fmtAmount(p.amount)}</td>
              <td class="mono">{p.sender}</td>
              <td class="mono dim">{fmtAmount(p.fee)}</td>
              <td class="mono dim">{fmtAmount(p.balance)}</td>
              <td class="mono dim">{p.ref || '—'}</td>
              <td class="mono dim">{fmtDateTime(p.dateReceived)}</td>
              <td class="mono dim">{p.simNumber ?? '—'}</td>
            </tr>
          {/each}
        {/if}
        {#if currentPage < pages}
          <tr bind:this={sentinel}>
            <td colspan="9" class="empty">{loading ? 'Loading more…' : ''}</td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>
