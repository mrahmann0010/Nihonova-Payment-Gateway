<script lang="ts">
  import { page } from '$app/state';
  import { auth } from '$lib/stores/auth.svelte';
  import { api, type Payment } from '$lib/api';
  import { createInfiniteQuery } from '@tanstack/svelte-query';
  import { keys } from '$lib/query';
  import Skeleton from '$lib/Skeleton.svelte';
  import { fmtAmount, fmtDateTime, platformLabel } from '$lib/format';

  const PLATFORM_TABS = ['all', 'bkash', 'nagad', 'rocket'];
  const LIMIT = 20;

  const initialSearch = page.url.searchParams.get('search') ?? '';
  let platform = $state('all');
  let search = $state(initialSearch);

  // Debounced search so we don't refetch on every keystroke.
  let debouncedSearch = $state(initialSearch);
  let debounce: ReturnType<typeof setTimeout>;
  $effect(() => {
    search;
    clearTimeout(debounce);
    debounce = setTimeout(() => (debouncedSearch = search), 300);
    return () => clearTimeout(debounce);
  });

  // Infinite, background-polled list. Refetching re-pulls every loaded page, so
  // a new transaction lands at the top on its own — no manual reload.
  const q = createInfiniteQuery(() => ({
    queryKey: keys.payments({ platform, search: debouncedSearch }),
    queryFn: ({ pageParam }) =>
      api.payments({ platform, search: debouncedSearch, page: pageParam, limit: LIMIT }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: auth.authed
  }));

  // Flatten pages, de-duping by key: a record inserted mid-scroll can otherwise
  // appear on two adjacent pages after a refetch.
  const rows = $derived.by(() => {
    const seen = new Set<string>();
    const out: Payment[] = [];
    for (const pg of q.data?.pages ?? []) {
      for (const p of pg.payments) {
        const k = p.platform + p.trxId;
        if (!seen.has(k)) { seen.add(k); out.push(p); }
      }
    }
    return out;
  });
  const total = $derived(q.data?.pages[0]?.total ?? 0);
  const loading = $derived(q.isPending || q.isFetchingNextPage);
  const hasMore = $derived(q.hasNextPage);

  // Infinite scroll: observe the sentinel row.
  let sentinel = $state<HTMLElement>();
  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && q.hasNextPage && !q.isFetchingNextPage) {
        q.fetchNextPage();
      }
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
  <div class="info-row">
    {#if !rows.length && loading}
      <Skeleton width="90px" height="0.82rem" />
    {:else}
      {total.toLocaleString()} record{total === 1 ? '' : 's'}
    {/if}
  </div>
  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th>Platform</th><th>TrxID</th><th>Amount</th><th>Sender</th>
          <th>Fee</th><th>Balance</th><th>Ref</th><th>Date · time</th><th>SIM</th>
        </tr>
      </thead>
      <tbody>
        {#if !rows.length && loading}
          {#each Array(8) as _}
            <tr>
              {#each Array(9) as _}<td><Skeleton width="70%" height="0.9rem" /></td>{/each}
            </tr>
          {/each}
        {:else if !rows.length}
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
        {#if hasMore}
          <tr bind:this={sentinel}>
            <td colspan="9" class="empty">{q.isFetchingNextPage ? 'Loading more…' : ''}</td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>
