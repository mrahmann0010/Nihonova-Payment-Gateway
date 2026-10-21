<script lang="ts">
  import type { Payment } from '$lib/api';
  import { fmtAgo, fmtDateTime, money } from '$lib/format';
  import PlatformPill from './PlatformPill.svelte';

  // One payment that nobody has claimed. Mirrors ClaimRow's layout so the two
  // ledgers read the same way — an admin moving between Claims and Unclaimed is
  // comparing the same fields and shouldn't have to re-learn where they sit.
  //
  // No action button: there is nothing an admin can do to a payment from here.
  // Claiming is a consuming app's write, and inventing an admin "mark as
  // claimed" would be a way to fake a redemption with no order behind it.
  let { payment }: { payment: Payment } = $props();
</script>

<div class="border-b border-line-faint px-4.5 py-4 last:border-b-0 tab:px-6">
  <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
    <div class="flex min-w-0 items-center gap-3">
      <PlatformPill platform={payment.platform} size="sm" />
      <span class="mono truncate text-ident font-semibold text-ink">{payment.trxId}</span>
    </div>

    <span class="mono flex-none text-amount-sm font-semibold text-money">
      {money(payment.amount)}
    </span>
  </div>

  <div class="mt-3 grid gap-3 text-small sm:grid-cols-2 tab:grid-cols-3">
    <div>
      <div class="text-nano text-ink-soft">Payer</div>
      <div class="mono text-ink-body">{payment.sender}</div>
    </div>
    <div>
      <div class="text-nano text-ink-soft">Received</div>
      <div class="mono text-ink-body" title={fmtDateTime(payment.dateReceived)}>
        {fmtAgo(payment.dateReceived)}
      </div>
    </div>
    <div>
      <div class="text-nano text-ink-soft">Reference</div>
      <div class="mono {payment.ref ? 'text-ink-body' : 'text-ink-faint'}">
        {payment.ref || '—'}
      </div>
    </div>
  </div>
</div>
