<script lang="ts">
  import type { Payment } from '$lib/api';
  import { fmtAgo, money } from '$lib/format';
  import Icon from './Icon.svelte';
  import PlatformPill from './PlatformPill.svelte';

  // Mobile row (<720px): the desktop ledger stacked into a card.
  let { payment, onopen }: { payment: Payment; onopen: (p: Payment) => void } = $props();
</script>

<button
  type="button"
  class="w-full cursor-pointer border-b border-line-faint px-4.5 py-4 text-left last:border-b-0 hover:bg-recessed"
  onclick={() => onopen(payment)}
>
  <div class="mb-2.5 flex items-center justify-between gap-3">
    <PlatformPill platform={payment.platform} size="sm" />
    <span class="mono text-amount-sm font-semibold text-money">{money(payment.amount)}</span>
  </div>
  <div class="flex items-center justify-between gap-3">
    <span class="mono text-label text-ink-body">{payment.trxId}</span>
    <span class="text-small text-ink-soft">{fmtAgo(payment.dateReceived)}</span>
  </div>
  <div class="mt-3 flex items-center justify-between gap-3">
    <span class="mono text-small text-ink-mid">{payment.sender}</span>
    <span class="inline-flex items-center gap-1 text-small font-semibold text-accent">
      Details<Icon name="chevron-down" size={13} stroke={2.4} />
    </span>
  </div>
</button>
