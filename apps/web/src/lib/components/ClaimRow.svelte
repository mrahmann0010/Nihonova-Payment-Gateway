<script lang="ts">
  import type { Claim } from '$lib/api';
  import { fmtAgo, fmtDateTime, money } from '$lib/format';
  import Button from './Button.svelte';
  import PlatformPill from './PlatformPill.svelte';
  import StatusBadge from './StatusBadge.svelte';

  // One row of the redemption ledger. Stacks below the `tab:` breakpoint the
  // same way the transactions ledger does, so the two pages behave alike on a
  // phone — which is where an admin actually fields "my payment didn't work".
  let {
    claim,
    busy = false,
    onrelease
  }: { claim: Claim; busy?: boolean; onrelease: (c: Claim) => void } = $props();

  const released = $derived(claim.state === 'released');
</script>

<div
  class="border-b border-line-faint px-4.5 py-4 last:border-b-0 tab:px-6
    {released ? 'bg-recessed/60' : ''}"
>
  <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
    <div class="flex min-w-0 items-center gap-3">
      <PlatformPill platform={claim.platform} size="sm" />
      <span class="mono truncate text-ident font-semibold {released ? 'text-ink-mid' : 'text-ink'}">
        {claim.trxId}
      </span>
    </div>

    <div class="flex flex-none items-center gap-3">
      <span class="mono text-amount-sm font-semibold {released ? 'text-ink-soft' : 'text-money'}">
        {money(claim.amount)}
      </span>
      <StatusBadge
        kind={released ? 'warn' : 'ok'}
        label={released ? 'Released' : 'Claimed'}
      />
    </div>
  </div>

  <div class="mt-3 grid gap-3 text-small sm:grid-cols-2 tab:grid-cols-4">
    <div>
      <div class="text-nano text-ink-soft">Business</div>
      <div class="mono text-ink-body">{claim.clientId}</div>
    </div>
    <div>
      <div class="text-nano text-ink-soft">Order</div>
      <div class="mono {claim.orderRef ? 'text-ink-body' : 'text-ink-faint'}">
        {claim.orderRef || '—'}
      </div>
    </div>
    <div>
      <div class="text-nano text-ink-soft">Payer</div>
      <div class="mono text-ink-body">{claim.sender}</div>
    </div>
    <div>
      <div class="text-nano text-ink-soft">Claimed</div>
      <div class="mono text-ink-body" title={fmtDateTime(claim.claimedAt)}>
        {fmtAgo(claim.claimedAt)}
      </div>
    </div>
  </div>

  {#if claim.overpaidBy > 0}
    <!-- Surfaced rather than buried: the student paid more than the order came
         to, and somebody has to decide whether to refund or credit it. -->
    <div
      class="mt-3 rounded-control border border-warn-border bg-warn-bg px-3.5 py-2.5 text-label
        leading-normal text-warn-text"
    >
      <span class="font-bold text-warn-ink">Overpaid by {money(claim.overpaidBy)}.</span>
      Order was {money(claim.expectedAmount)}, {money(claim.amount)} arrived.
    </div>
  {/if}

  {#if claim.underpaidBy > 0}
    <!-- The business took a short payment on purpose. Shown so the gap is on
         record here too, not only in that business's own books. -->
    <div
      class="mt-3 rounded-control border border-warn-border bg-warn-bg px-3.5 py-2.5 text-label
        leading-normal text-warn-text"
    >
      <span class="font-bold text-warn-ink">Accepted short by {money(claim.underpaidBy)}.</span>
      Order was {money(claim.expectedAmount)}, {money(claim.amount)} arrived.
    </div>
  {/if}

  {#if released}
    <div class="mt-3 rounded-control border border-line bg-panel px-3.5 py-2.5">
      <div class="text-nano text-ink-soft">
        Released {fmtDateTime(claim.releasedAt)}{claim.releasedBy ? ` by ${claim.releasedBy}` : ''}
      </div>
      {#if claim.releaseReason}
        <div class="mt-1 text-label leading-normal text-ink-body">{claim.releaseReason}</div>
      {/if}
    </div>
  {:else}
    <div class="mt-3.5 flex justify-end">
      <Button size="sm" variant="danger" disabled={busy} onclick={() => onrelease(claim)}>
        Release
      </Button>
    </div>
  {/if}
</div>
