<script lang="ts">
  import { createInfiniteQuery, createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { api, ApiError, type Claim, type ClaimsPage } from '$lib/api';
  import { keys } from '$lib/query';
  import { auth } from '$lib/stores/auth.svelte';
  import { toasts } from '$lib/stores/toasts.svelte';
  import Button from '$lib/components/Button.svelte';
  import ClaimRow from '$lib/components/ClaimRow.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Input from '$lib/components/Input.svelte';
  import LoadError from '$lib/components/LoadError.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import ReleaseClaimModal from '$lib/components/ReleaseClaimModal.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import SignOutButton from '$lib/components/SignOutButton.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const queryClient = useQueryClient();

  // --- filters ---
  let stateFilter = $state('claimed');
  let clientId = $state('');
  // Exact match, not a prefix: this answers "what happened to THIS transaction".
  let trxId = $state('');
  let trxSubmitted = $state('');

  const params = $derived({ state: stateFilter, clientId, trxId: trxSubmitted, limit: 25 });

  // The businesses list doubles as the filter's options — no separate endpoint.
  const clientsQ = createQuery(() => ({
    queryKey: keys.clients,
    queryFn: api.clients,
    enabled: auth.authed
  }));

  // Keyset paging over the server's nextCursor, same as the transactions list.
  const q = createInfiniteQuery(() => ({
    queryKey: keys.claims(params),
    queryFn: ({ pageParam }) =>
      api.claims({ ...params, ...(pageParam ? { cursor: pageParam as string } : {}) }),
    initialPageParam: '',
    getNextPageParam: (last: ClaimsPage) => last.nextCursor ?? undefined,
    enabled: auth.authed
  }));

  // Flatten, then de-dupe by id: a claim released between two page fetches can
  // shift across the cursor boundary and arrive twice.
  const claims = $derived.by(() => {
    const seen = new Set<string>();
    const out: Claim[] = [];
    for (const page of q.data?.pages ?? []) {
      for (const c of page.claims) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push(c);
      }
    }
    return out;
  });

  // --- release ---
  let releasing = $state<Claim | null>(null);
  let releaseOpen = $state(false);
  let releaseError = $state('');

  const message = (e: unknown) =>
    e instanceof ApiError ? e.message : 'Something went wrong — try again';

  const release = createMutation(() => ({
    mutationFn: (vars: { id: string; reason: string }) => api.releaseClaim(vars.id, vars.reason),
    onSuccess: (res) => {
      releaseOpen = false;
      releaseError = '';
      toasts.ok(`${res.claim.trxId} released — the payment can be claimed again`);
      queryClient.invalidateQueries({ queryKey: ['claims'] });
    },
    onError: (e: unknown) => (releaseError = message(e))
  }));

  function openRelease(claim: Claim) {
    releasing = claim;
    releaseError = '';
    releaseOpen = true;
  }

  const clientOptions = $derived([
    { value: '', label: 'All businesses' },
    ...(clientsQ.data?.clients ?? []).map((c) => ({ value: c.clientId, label: c.name }))
  ]);

  const meta = $derived(
    claims.length
      ? `${claims.length} shown${q.hasNextPage ? ' · more available' : ''}`
      : undefined
  );
</script>

<PageHeader
  title="Claims"
  {meta}
  subtitle="Every payment that has been spent, by which business, and on what order. Releasing one hands the payment back."
>
  {#snippet actions()}
    <SignOutButton />
  {/snippet}
</PageHeader>

<div class="mt-5 flex flex-wrap items-end gap-4">
  <Segmented
    bind:value={stateFilter}
    label="State"
    options={[
      { value: 'claimed', label: 'Claimed' },
      { value: 'released', label: 'Released' },
      { value: 'all', label: 'All' }
    ]}
  />

  {#if clientOptions.length > 2}
    <Segmented bind:value={clientId} label="Business" options={clientOptions} />
  {/if}

  <form
    class="min-w-[220px] flex-1"
    onsubmit={(e) => {
      e.preventDefault();
      trxSubmitted = trxId.trim();
    }}
  >
    <div class="mb-1.5 text-label font-semibold text-ink-body">Transaction ID</div>
    <Input bind:value={trxId} mono icon="search" placeholder="exact ID, then Enter" />
  </form>
</div>

<div class="mt-5">
  {#if q.isError}
    <LoadError title="Couldn't load claims" meta="/admin/api/claims" onRetry={() => q.refetch()} />
  {:else if q.isPending}
    <div class="rounded-panel border border-line bg-panel p-6 shadow-card">
      {#each Array(3) as _}
        <div class="mb-4 last:mb-0"><Skeleton width="100%" height="64px" /></div>
      {/each}
    </div>
  {:else if claims.length === 0}
    <div class="rounded-panel border border-line bg-panel shadow-card">
      <!-- Neutral, not red: no claims yet is the expected state until the
           consuming apps are cut over, not a fault. -->
      <EmptyState
        align="center"
        title={trxSubmitted ? 'No claim for that transaction' : 'No claims yet'}
        description={trxSubmitted
          ? 'That payment has not been spent — or the ID does not match one exactly.'
          : 'Claims appear here once a business redeems a payment through POST /v1/claims.'}
      />
    </div>
  {:else}
    <div class="overflow-hidden rounded-panel border border-line bg-panel shadow-card">
      {#each claims as claim (claim.id)}
        <ClaimRow
          {claim}
          busy={release.isPending}
          onrelease={openRelease}
        />
      {/each}
    </div>

    {#if q.hasNextPage}
      <div class="mt-4 flex justify-center">
        <Button disabled={q.isFetchingNextPage} onclick={() => q.fetchNextPage()}>
          {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      </div>
    {/if}
  {/if}
</div>

<ReleaseClaimModal
  bind:open={releaseOpen}
  claim={releasing}
  busy={release.isPending}
  error={releaseError}
  onsubmit={(reason) => releasing && release.mutate({ id: releasing.id, reason })}
/>
