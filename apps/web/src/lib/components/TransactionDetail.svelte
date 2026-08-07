<script lang="ts">
  import type { Payment } from '$lib/api';
  import { fmtAmount, fmtDateTime, money } from '$lib/format';
  import { toasts } from '$lib/stores/toasts.svelte';
  import Button from './Button.svelte';
  import Field from './Field.svelte';
  import Modal from './Modal.svelte';
  import PlatformPill from './PlatformPill.svelte';

  let { payment = $bindable(null) }: { payment?: Payment | null } = $props();

  const open = $derived(payment !== null);

  async function copyTrx() {
    if (!payment) return;
    try {
      await navigator.clipboard.writeText(payment.trxId);
      toasts.ok('TrxID copied');
    } catch {
      toasts.error("Couldn't copy TrxID");
    }
  }
</script>

{#if payment}
  {@const p = payment}
  <Modal {open} title="Transaction detail" onclose={() => (payment = null)}>
    <div class="mb-5 flex flex-wrap items-center gap-3.5">
      <PlatformPill platform={p.platform} />
      <span class="mono text-amount-lg font-semibold tracking-[-0.01em] text-money">
        {money(p.amount)}
      </span>
    </div>

    <div class="grid grid-cols-2 gap-x-6 gap-y-4">
      <Field label="TrxID" value={p.trxId} strong />
      <Field label="Sender" value={p.sender} strong />
      <Field label="Received" value={fmtDateTime(p.dateReceived)} />
      <Field label="SIM" value={p.simNumber == null ? null : `SIM ${p.simNumber}`} />
      <Field label="Fee" value={fmtAmount(p.fee)} />
      <Field label="Balance" value={fmtAmount(p.balance)} />
      <Field label="Reference" value={p.ref} />
    </div>

    {#snippet footer()}
      <Button onclick={copyTrx}>Copy TrxID</Button>
      <Button variant="primary" onclick={() => (payment = null)}>Close</Button>
    {/snippet}
  </Modal>
{/if}
