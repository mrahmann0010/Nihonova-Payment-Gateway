<script lang="ts">
  import { type Claim } from '$lib/api';
  import { fmtDateTime, money } from '$lib/format';
  import Button from './Button.svelte';
  import Field from './Field.svelte';
  import FormRow from './FormRow.svelte';
  import Modal from './Modal.svelte';
  import PlatformPill from './PlatformPill.svelte';
  import Textarea from './Textarea.svelte';

  // Releasing is the only action in the system that makes a spent payment
  // spendable again, so the dialog spells out what the payment was and insists
  // on a reason. ConfirmDialog would be the wrong component here — it takes a
  // yes/no, and this needs a sentence that lands in the audit trail.
  let {
    open = $bindable(false),
    claim = null,
    busy = false,
    error = '',
    onsubmit
  }: {
    open?: boolean;
    claim?: Claim | null;
    busy?: boolean;
    error?: string;
    onsubmit: (reason: string) => void;
  } = $props();

  let reason = $state('');

  // Clear on every open so a cancelled release never seeds the next one.
  $effect(() => {
    if (open) reason = '';
  });

  const canSubmit = $derived(!!reason.trim() && !busy);

  function submit() {
    if (!canSubmit) return;
    onsubmit(reason.trim());
  }
</script>

<Modal bind:open title="Release this claim" width="md">
  {#if claim}
    <div class="flex flex-col gap-5">
      <div class="rounded-control border border-line bg-recessed px-4 py-3.5">
        <div class="mb-3 flex items-center justify-between gap-3">
          <span class="mono text-ident font-semibold text-ink">{claim.trxId}</span>
          <PlatformPill platform={claim.platform} size="sm" />
        </div>
        <div class="grid gap-3.5 sm:grid-cols-3">
          <Field label="Amount" value={money(claim.amount)} strong />
          <Field label="Claimed by" value={claim.clientId} />
          <Field label="Claimed" value={fmtDateTime(claim.claimedAt)} />
        </div>
      </div>

      <p class="text-body leading-normal text-ink-mid">
        <span class="font-semibold text-ink">The payment becomes claimable again.</span>
        The next business to send this transaction ID will get it — including a different
        business from the one that holds it now. The claim record is kept, not deleted.
      </p>

      <FormRow
        label="Reason"
        required
        hint="stored on the record"
        error={error || null}
      >
        <Textarea bind:value={reason} placeholder="e.g. Refunded order ORD-8821 — student cancelled." />
      </FormRow>
    </div>
  {/if}

  {#snippet footer()}
    <Button onclick={() => (open = false)} disabled={busy}>Cancel</Button>
    <Button variant="danger" onclick={submit} disabled={!canSubmit}>
      {busy ? 'Releasing…' : 'Release claim'}
    </Button>
  {/snippet}
</Modal>
