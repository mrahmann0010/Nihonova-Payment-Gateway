<script lang="ts">
  import { page } from '$app/state';
  import { auth } from '$lib/stores/auth.svelte';
  import { api, type Payment } from '$lib/api';
  import { createInfiniteQuery } from '@tanstack/svelte-query';
  import { keys } from '$lib/query';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Input from '$lib/components/Input.svelte';
  import LoadError from '$lib/components/LoadError.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PlatformPill from '$lib/components/PlatformPill.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import SignOutButton from '$lib/components/SignOutButton.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import TransactionCard from '$lib/components/TransactionCard.svelte';
  import TransactionDetail from '$lib/components/TransactionDetail.svelte';
  import { fmtAmount, fmtDateTime, money, platformLabel } from '$lib/format';

  const PLATFORM_TABS = [
    { value: 'all', label: 'All' },
    ...['bkash', 'nagad', 'rocket'].map((p) => ({ value: p, label: platformLabel(p) }))
  ];
  const LIMIT = 20;

  const initialSearch = page.url.searchParams.get('search') ?? '';
  let platform = $state('all');
  let search = $state(initialSearch);
  let detail = $state<Payment | null>(null);

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
        if (!seen.has(k)) {
          seen.add(k);
          out.push(p);
        }
      }
    }
    return out;
  });
  const total = $derived(q.data?.pages[0]?.total ?? 0);
  const filtered = $derived(platform !== 'all' || debouncedSearch.trim() !== '');

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

  const th =
    'px-5 py-3 text-left text-nano font-semibold tracking-[0.05em] text-ink-soft uppercase whitespace-nowrap';
  const td = 'px-5 py-3 whitespace-nowrap';
</script>

<PageHeader title="Transactions" subtitle="Filter, search, and scroll through every record.">
  {#snippet actions()}
    <SignOutButton />
  {/snippet}
</PageHeader>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center gap-3">
    <Segmented bind:value={platform} options={PLATFORM_TABS} label="Filter by platform" />
    <div class="min-w-45 flex-1">
      <Input bind:value={search} icon="search" placeholder="Search trxId or sender…" />
    </div>
  </div>

  {#if q.isError}
    <LoadError
      title="Couldn't load transactions"
      meta="/admin/api/payments"
      onRetry={() => q.refetch()}
    />
  {:else}
    <div class="overflow-hidden rounded-panel border border-line bg-panel shadow-card">
      <div
        class="flex items-center justify-between gap-3 border-b border-line-soft bg-recessed px-5 py-3"
      >
        {#if q.isPending}
          <Skeleton width="90px" height="12px" />
        {:else}
          <span class="mono text-label text-ink-mid">
            {total.toLocaleString()} record{total === 1 ? '' : 's'}
          </span>
        {/if}
        {#if q.isFetching && !q.isPending}<Spinner size={14} />{/if}
      </div>

      {#if q.isPending}
        <div class="hidden tab:block">
          {#each Array(8) as _}
            <div class="flex items-center gap-4 border-b border-line-faint px-5 py-3.5">
              <Skeleton width="76px" height="22px" round="full" />
              <Skeleton width="30%" height="12px" />
              <Skeleton width="80px" height="12px" />
              <Skeleton width="110px" height="12px" />
            </div>
          {/each}
        </div>
        <div class="tab:hidden">
          {#each Array(5) as _}
            <div class="flex flex-col gap-2.5 border-b border-line-faint px-4.5 py-4">
              <div class="flex justify-between">
                <Skeleton width="76px" height="22px" round="full" />
                <Skeleton width="100px" height="20px" />
              </div>
              <Skeleton width="60%" height="12px" />
            </div>
          {/each}
        </div>
      {:else if !rows.length}
        <EmptyState
          align="center"
          title={filtered ? 'No payments match this filter' : 'No payments yet'}
          description={filtered
            ? 'Try a different platform, or clear the search.'
            : "Nothing has been forwarded to the gateway so far. The pipeline is healthy — there's simply nothing to show."}
        />
      {:else}
        <!-- Desktop ledger -->
        <div class="hidden overflow-x-auto tab:block">
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b border-line-soft bg-recessed">
                <th class={th}>Platform</th>
                <th class={th}>TrxID</th>
                <th class="{th} text-right!">Amount</th>
                <th class={th}>Sender</th>
                <th class="{th} text-right!">Fee</th>
                <th class="{th} text-right!">Balance</th>
                <th class={th}>Ref</th>
                <th class={th}>Date · time</th>
                <th class="{th} text-right!">SIM</th>
              </tr>
            </thead>
            <tbody>
              {#each rows as p (p.platform + p.trxId)}
                <tr
                  class="cursor-pointer border-b border-line-faint hover:bg-recessed"
                  onclick={() => (detail = p)}
                >
                  <td class={td}><PlatformPill platform={p.platform} size="sm" /></td>
                  <td class="{td} mono text-label font-medium">{p.trxId}</td>
                  <td class="{td} mono text-right text-label text-money">{money(p.amount)}</td>
                  <td class="{td} mono text-label">{p.sender}</td>
                  <td class="{td} mono text-right text-label text-ink-soft">{fmtAmount(p.fee)}</td>
                  <td class="{td} mono text-right text-label text-ink-soft">
                    {fmtAmount(p.balance)}
                  </td>
                  <td class="{td} mono text-label {p.ref ? 'text-ink-mid' : 'text-ink-faint'}">
                    {p.ref || '—'}
                  </td>
                  <td class="{td} mono text-label text-ink-mid">{fmtDateTime(p.dateReceived)}</td>
                  <td
                    class="{td} mono text-right text-label {p.simNumber == null
                      ? 'text-ink-faint'
                      : 'text-ink-soft'}"
                  >
                    {p.simNumber ?? '—'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Mobile stack (<720px) -->
        <div class="tab:hidden">
          {#each rows as p (p.platform + p.trxId)}
            <TransactionCard payment={p} onopen={(x) => (detail = x)} />
          {/each}
        </div>
      {/if}

      {#if q.hasNextPage}
        <div bind:this={sentinel} class="flex items-center justify-center gap-2.5 px-5 py-5">
          {#if q.isFetchingNextPage}
            <Spinner size={14} />
            <span class="text-label text-ink-mid">Loading more…</span>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<TransactionDetail bind:payment={detail} />
