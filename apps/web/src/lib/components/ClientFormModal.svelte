<script lang="ts">
  import type { Client, ClientInput } from '$lib/api';
  import { validateSecret } from '$lib/secret';
  import Button from './Button.svelte';
  import Checkbox from './Checkbox.svelte';
  import FormRow from './FormRow.svelte';
  import Input from './Input.svelte';
  import Modal from './Modal.svelte';
  import SecretField from './SecretField.svelte';
  import Textarea from './Textarea.svelte';

  // Register a business, or edit one. Same fields either way except the two
  // that can only ever be set once: the client ID (immutable — future claims
  // record it) and the first secret (rotation is its own, separate flow).
  let {
    open = $bindable(false),
    client = null,
    busy = false,
    error = '',
    onsubmit
  }: {
    open?: boolean;
    /** null → register a new business; a client → edit that one. */
    client?: Client | null;
    busy?: boolean;
    error?: string;
    onsubmit: (values: ClientInput & { clientId: string; secret: string }) => void;
  } = $props();

  const editing = $derived(!!client);

  let clientId = $state('');
  let name = $state('');
  let ownerName = $state('');
  let ownerEmail = $state('');
  let ownerPhone = $state('');
  let notes = $state('');
  let maxClaimAmount = $state('');
  let claimWindowDays = $state('');
  let requireSenderMatch = $state(false);
  let secret = $state('');
  let touched = $state(false);

  // Reset to the target's values every time the dialog opens, so a cancelled
  // edit never leaks into the next one.
  $effect(() => {
    if (!open) return;
    clientId = client?.clientId ?? '';
    name = client?.name ?? '';
    ownerName = client?.ownerName ?? '';
    ownerEmail = client?.ownerEmail ?? '';
    ownerPhone = client?.ownerPhone ?? '';
    notes = client?.notes ?? '';
    maxClaimAmount = client?.maxClaimAmount != null ? String(client.maxClaimAmount) : '';
    claimWindowDays = client?.claimWindowDays != null ? String(client.claimWindowDays) : '';
    requireSenderMatch = client?.requireSenderMatch ?? false;
    secret = '';
    touched = false;
  });

  // Mirrors CLIENT_ID_RE on the server.
  const idOk = $derived(/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(clientId));
  const idError = $derived(
    !touched || !clientId || idOk
      ? null
      : 'Lowercase letters, digits and hyphens only — 3–40 characters, starting with a letter'
  );

  const numberError = (raw: string) =>
    raw && !(Number(raw) > 0) ? 'Must be a positive number' : null;

  const canSave = $derived(
    !!name.trim() &&
      (editing || (idOk && !validateSecret(secret, clientId))) &&
      !numberError(maxClaimAmount) &&
      !numberError(claimWindowDays)
  );

  // '' clears a limit; the server reads null as "no ceiling".
  const limit = (raw: string) => (raw.trim() === '' ? null : Number(raw));

  function submit() {
    touched = true;
    if (!canSave || busy) return;
    onsubmit({
      clientId: clientId.trim().toLowerCase(),
      name: name.trim(),
      ownerName: ownerName.trim(),
      ownerEmail: ownerEmail.trim(),
      ownerPhone: ownerPhone.trim(),
      notes: notes.trim(),
      maxClaimAmount: limit(maxClaimAmount),
      claimWindowDays: limit(claimWindowDays),
      requireSenderMatch,
      secret
    });
  }
</script>

<!-- Lighter than SectionHeading: inside a 14px form, an 18px heading would
     outrank the field labels it is meant to group. -->
{#snippet groupLabel(title: string, note: string)}
  <div class="mb-3 flex items-baseline gap-2 border-t border-line-soft pt-4">
    <span class="text-nano font-semibold tracking-[0.05em] text-ink-mid uppercase">{title}</span>
    <span class="text-nano text-ink-soft">{note}</span>
  </div>
{/snippet}

<Modal bind:open title={editing ? `Edit ${client?.name}` : 'Register a business'}>
  <div class="flex flex-col gap-4.5">
    <div class="grid gap-4 sm:grid-cols-2">
      <FormRow label="Business name" required>
        <Input bind:value={name} placeholder="Nihonova Academy" />
      </FormRow>

      <FormRow
        label="Client ID"
        hint={editing ? 'permanent' : 'permanent once saved'}
        required={!editing}
        error={editing ? null : idError}
      >
        {#if editing}
          <div
            class="mono flex items-center rounded-control border border-line bg-fill px-3.5 py-2.75
              text-ident text-ink-mid"
          >
            {clientId}
          </div>
        {:else}
          <Input bind:value={clientId} mono placeholder="nihonova-academy" />
        {/if}
      </FormRow>
    </div>

    {#if !editing}
      <FormRow label="Secret" hint="stored as a hash — never shown again" required>
        <SecretField bind:value={secret} {clientId} {touched} />
      </FormRow>
    {/if}

    <div>
      {@render groupLabel('Who to contact', 'when this key leaks or the integration breaks')}
      <div class="grid gap-4 sm:grid-cols-2">
        <FormRow label="Owner">
          <Input bind:value={ownerName} placeholder="Full name" />
        </FormRow>
        <FormRow label="Email">
          <Input bind:value={ownerEmail} mono placeholder="owner@example.com" />
        </FormRow>
        <FormRow label="Phone">
          <Input bind:value={ownerPhone} mono placeholder="01712345678" />
        </FormRow>
      </div>
    </div>

    <div>
      {@render groupLabel('Limits', 'how far a leaked secret could get')}
      <div class="grid gap-4 sm:grid-cols-2">
        <FormRow
          label="Max claim amount"
          hint="blank = no ceiling"
          error={touched ? numberError(maxClaimAmount) : null}
        >
          <Input bind:value={maxClaimAmount} mono placeholder="৳ per transaction" />
        </FormRow>
        <FormRow
          label="Claim window"
          hint="blank = no bound"
          error={touched ? numberError(claimWindowDays) : null}
        >
          <Input bind:value={claimWindowDays} mono placeholder="days a payment stays claimable" />
        </FormRow>
      </div>
      <div class="mt-4">
        <Checkbox
          bind:checked={requireSenderMatch}
          label="Require the payer's phone to match"
          hint="Claims must send senderPhone, and it must match the number the payment came from. Off unless this business collects the payer's number at checkout."
        />
      </div>
    </div>

    <FormRow label="Notes">
      <Textarea bind:value={notes} placeholder="Anything the next admin will need to know." />
    </FormRow>

    {#if error}
      <div
        class="rounded-control border border-danger-border bg-danger-bg px-3.5 py-2.75 text-label
          font-medium text-danger-ink"
      >
        {error}
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <Button onclick={() => (open = false)}>Cancel</Button>
    <Button variant="primary" disabled={busy} onclick={submit}>
      {busy ? 'Saving…' : editing ? 'Save changes' : 'Register business'}
    </Button>
  {/snippet}
</Modal>
