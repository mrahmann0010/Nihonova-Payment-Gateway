<script lang="ts">
  import type { Client } from '$lib/api';
  import { validateSecret } from '$lib/secret';
  import Button from './Button.svelte';
  import FormRow from './FormRow.svelte';
  import Input from './Input.svelte';
  import Modal from './Modal.svelte';
  import SecretField from './SecretField.svelte';
  import Segmented from './Segmented.svelte';

  // Rotation is the one action here that can take a live checkout down, so it
  // asks for the business name to be typed before it will run — the same bar
  // you'd want in front of anything that touches money in flight.
  let {
    open = $bindable(false),
    client,
    busy = false,
    error = '',
    onsubmit
  }: {
    open?: boolean;
    client: Client;
    busy?: boolean;
    error?: string;
    onsubmit: (secret: string, graceHours: number) => void;
  } = $props();

  let secret = $state('');
  let grace = $state('24');
  let confirmName = $state('');
  let touched = $state(false);

  $effect(() => {
    if (!open) return;
    secret = '';
    grace = '24';
    confirmName = '';
    touched = false;
  });

  const graceOptions = [
    { value: '0', label: 'None' },
    { value: '1', label: '1 hour' },
    { value: '24', label: '24 hours' },
    { value: '72', label: '3 days' },
    { value: '168', label: '7 days' }
  ];

  const nameMatches = $derived(confirmName.trim().toLowerCase() === client.name.trim().toLowerCase());
  const canSave = $derived(!validateSecret(secret, client.clientId) && nameMatches);

  function submit() {
    touched = true;
    if (!canSave || busy) return;
    onsubmit(secret, Number(grace));
  }
</script>

<Modal bind:open title="Rotate {client.name}'s secret">
  <div class="flex flex-col gap-4.5">
    <p class="text-ctl leading-normal text-ink-mid">
      The new secret takes effect immediately. The current one keeps working until the grace window
      closes, so you can deploy
      <code class="mono text-ident text-ink">{client.clientId}</code> without a gap where checkout is
      down.
    </p>

    <FormRow label="New secret" hint="must be one this client has never had" required>
      <SecretField bind:value={secret} clientId={client.clientId} {touched} />
    </FormRow>

    <FormRow
      label="Keep the old secret valid for"
      hint={grace === '0' ? 'the old secret dies the moment you save' : 'time to redeploy the app'}
    >
      <Segmented bind:value={grace} options={graceOptions} label="Grace window" />
    </FormRow>

    <FormRow label="Type the business name to confirm" required>
      <Input bind:value={confirmName} placeholder={client.name} />
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
    <Button variant="primary" disabled={busy || !canSave} onclick={submit}>
      {busy ? 'Rotating…' : 'Rotate secret'}
    </Button>
  {/snippet}
</Modal>
