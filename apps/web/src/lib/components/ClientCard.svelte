<script lang="ts">
  import type { Client } from '$lib/api';
  import { fmtAgo, fmtDateTime, money } from '$lib/format';
  import Button from './Button.svelte';
  import Field from './Field.svelte';
  import Icon from './Icon.svelte';
  import StatusBadge from './StatusBadge.svelte';

  let {
    client,
    busy = false,
    onedit,
    onrotate,
    onrevokePrevious,
    ontoggleActive
  }: {
    client: Client;
    busy?: boolean;
    onedit: () => void;
    onrotate: () => void;
    onrevokePrevious: () => void;
    ontoggleActive: () => void;
  } = $props();

  // A client that has never authenticated isn't broken — it just hasn't been
  // wired up yet. That's an EmptyState-shaped fact, not an ErrorState one, so
  // it reads as neutral grey rather than a red badge.
  const neverUsed = $derived(!client.lastUsedAt);
  const graceOpen = $derived(!!client.previousExpiresAt);
</script>

<section class="overflow-hidden rounded-panel border border-line bg-panel shadow-card">
  <header
    class="flex flex-wrap items-start justify-between gap-4 border-b border-line-soft px-6 py-4.5"
  >
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-2.5">
        <h3 class="text-card font-bold">{client.name}</h3>
        <StatusBadge
          kind={client.active ? 'ok' : 'down'}
          label={client.active ? 'Active' : 'Deactivated'}
        />
      </div>
      <div class="mono mt-1 text-label text-ink-mid">{client.clientId}</div>
    </div>

    <div class="flex flex-none flex-wrap items-center gap-2.5">
      <Button size="sm" disabled={busy} onclick={onedit}>Edit</Button>
      <Button size="sm" disabled={busy} onclick={onrotate}>
        <Icon name="rotate" size={13} /> Rotate secret
      </Button>
      <Button size="sm" variant={client.active ? 'danger' : 'primary'} disabled={busy} onclick={ontoggleActive}>
        {client.active ? 'Deactivate' : 'Reactivate'}
      </Button>
    </div>
  </header>

  {#if graceOpen}
    <!-- Two secrets authenticate right now. That's intended during a rotation,
         but it's a window worth being able to close early. -->
    <div
      class="flex flex-wrap items-center justify-between gap-3 border-b border-warn-border
        bg-warn-bg px-6 py-3"
    >
      <div class="flex items-start gap-2.5">
        <span class="mt-0.25 flex-none text-warn-ink"><Icon name="clock" size={15} /></span>
        <div class="text-label leading-normal text-warn-text">
          <span class="font-bold text-warn-ink">The old secret still works.</span>
          It stops at <span class="mono">{fmtDateTime(client.previousExpiresAt)}</span>.
        </div>
      </div>
      <Button size="sm" variant="danger" disabled={busy} onclick={onrevokePrevious}>
        Revoke old secret
      </Button>
    </div>
  {/if}

  <div class="grid gap-4.5 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
    <Field label="Owner" value={client.ownerName} />
    <Field label="Email" value={client.ownerEmail} />
    <Field label="Phone" value={client.ownerPhone} />
    <Field label="Registered" value={fmtDateTime(client.createdAt)} />

    <Field
      label="Max claim"
      value={client.maxClaimAmount != null ? money(client.maxClaimAmount) : 'No ceiling'}
      strong={client.maxClaimAmount != null}
    />
    <Field
      label="Claim window"
      value={client.claimWindowDays != null ? `${client.claimWindowDays} days` : 'No bound'}
      strong={client.claimWindowDays != null}
    />
    <Field
      label="Sender check"
      value={client.requireSenderMatch ? 'Phone must match' : 'Not required'}
      strong={client.requireSenderMatch}
    />
    <Field label="Secret set" value={fmtDateTime(client.secretSetAt)} />
    <div>
      <div class="mb-1 text-nano text-ink-soft">Last used</div>
      <div class="mono text-ident {neverUsed ? 'text-ink-faint' : 'text-ink'}">
        {neverUsed ? 'Never — not wired up yet' : fmtAgo(client.lastUsedAt)}
      </div>
    </div>
  </div>

  {#if client.notes}
    <div class="border-t border-line-soft bg-recessed px-6 py-3.25">
      <div class="mb-1 text-nano text-ink-soft">Notes</div>
      <p class="text-label leading-normal text-ink-mid">{client.notes}</p>
    </div>
  {/if}
</section>
