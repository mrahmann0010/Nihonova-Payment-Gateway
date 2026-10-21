<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { api, ApiError, type Client, type ClientInput } from '$lib/api';
  import { keys } from '$lib/query';
  import { auth } from '$lib/stores/auth.svelte';
  import { toasts } from '$lib/stores/toasts.svelte';
  import Button from '$lib/components/Button.svelte';
  import ClientCard from '$lib/components/ClientCard.svelte';
  import ClientFormModal from '$lib/components/ClientFormModal.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import LoadError from '$lib/components/LoadError.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import RotateSecretModal from '$lib/components/RotateSecretModal.svelte';
  import SecretReveal from '$lib/components/SecretReveal.svelte';
  import SignOutButton from '$lib/components/SignOutButton.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const queryClient = useQueryClient();

  const q = createQuery(() => ({
    queryKey: keys.clients,
    queryFn: api.clients,
    enabled: auth.authed
  }));
  const clients = $derived(q.data?.clients ?? []);

  // --- dialog state ---
  let formOpen = $state(false);
  let editing = $state<Client | null>(null);
  let rotating = $state<Client | null>(null);
  let rotateOpen = $state(false);
  let confirmOpen = $state(false);
  let confirm = $state<{ title: string; description: string; label: string; run: () => void } | null>(
    null
  );

  // The plaintext, held only long enough to show it once. It was generated or
  // typed in this tab and never came back from the server — there is nowhere
  // else it exists, which is why closing this dialog really is the last chance.
  let reveal = $state<{ clientId: string; secret: string; rotated: boolean } | null>(null);

  let formError = $state('');
  let rotateError = $state('');

  const message = (e: unknown) =>
    e instanceof ApiError ? e.message : 'Something went wrong — try again';

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.clients });

  // --- mutations ---
  const create = createMutation(() => ({
    mutationFn: (vars: ClientInput & { clientId: string; name: string; secret: string }) =>
      api.createClient(vars),
    onSuccess: (_res, vars) => {
      formOpen = false;
      formError = '';
      reveal = { clientId: vars.clientId, secret: vars.secret, rotated: false };
      toasts.ok(`${vars.name} registered`);
      refresh();
    },
    onError: (e: unknown) => (formError = message(e))
  }));

  const update = createMutation(() => ({
    mutationFn: (vars: { clientId: string; body: ClientInput }) =>
      api.updateClient(vars.clientId, vars.body),
    onSuccess: (res) => {
      formOpen = false;
      formError = '';
      toasts.ok(`${res.client.name} updated`);
      refresh();
    },
    onError: (e: unknown) => (formError = message(e))
  }));

  const rotate = createMutation(() => ({
    mutationFn: (vars: { clientId: string; secret: string; graceHours: number }) =>
      api.rotateClientSecret(vars.clientId, vars.secret, vars.graceHours),
    onSuccess: (_res, vars) => {
      rotateOpen = false;
      rotateError = '';
      reveal = { clientId: vars.clientId, secret: vars.secret, rotated: vars.graceHours > 0 };
      refresh();
    },
    onError: (e: unknown) => (rotateError = message(e))
  }));

  const revokePrevious = createMutation(() => ({
    mutationFn: (clientId: string) => api.revokeClientPrevious(clientId),
    onSuccess: (res) => {
      toasts.ok(`Old secret revoked for ${res.client.name}`);
      refresh();
    },
    onError: (e: unknown) => toasts.error(message(e))
  }));

  const busy = $derived(
    create.isPending || update.isPending || rotate.isPending || revokePrevious.isPending
  );

  // --- actions ---
  function openRegister() {
    editing = null;
    formError = '';
    formOpen = true;
  }

  function openEdit(client: Client) {
    editing = client;
    formError = '';
    formOpen = true;
  }

  function openRotate(client: Client) {
    rotating = client;
    rotateError = '';
    rotateOpen = true;
  }

  function submitForm(values: ClientInput & { clientId: string; secret: string }) {
    const { clientId, secret, ...body } = values;
    if (editing) update.mutate({ clientId: editing.clientId, body });
    else create.mutate({ ...body, clientId, secret, name: body.name ?? '' });
  }

  function toggleActive(client: Client) {
    if (!client.active) {
      update.mutate({ clientId: client.clientId, body: { active: true } });
      return;
    }
    confirm = {
      title: `Deactivate ${client.name}?`,
      description:
        'Its credential stops working immediately and its checkout will fail to verify payments. The record and its history are kept — you can reactivate at any time.',
      label: 'Deactivate',
      run: () => update.mutate({ clientId: client.clientId, body: { active: false } })
    };
    confirmOpen = true;
  }

  function askRevokePrevious(client: Client) {
    confirm = {
      title: `Revoke ${client.name}'s old secret?`,
      description:
        'The previous secret stops authenticating right now, before its grace window would have closed. If the app has not been redeployed with the new secret yet, its checkout breaks.',
      label: 'Revoke now',
      run: () => revokePrevious.mutate(client.clientId)
    };
    confirmOpen = true;
  }

  const inactiveCount = $derived(clients.filter((c) => !c.active).length);
  const meta = $derived(
    clients.length
      ? `${clients.length} registered${inactiveCount ? ` · ${inactiveCount} deactivated` : ''}`
      : undefined
  );
</script>

<PageHeader
  title="Businesses"
  {meta}
  subtitle="Every app allowed to verify payments against this gateway, and the credential it uses."
>
  {#snippet actions()}
    <Button variant="primary" onclick={openRegister}>
      <Icon name="plus" size={14} stroke={2.4} /> Register business
    </Button>
    <SignOutButton />
  {/snippet}
</PageHeader>

{#if q.isError}
  <LoadError
    title="Couldn't load businesses"
    meta="/admin/api/clients"
    onRetry={() => q.refetch()}
  />
{:else if q.isPending}
  <div class="flex flex-col gap-5">
    {#each Array(2) as _}
      <div class="rounded-panel border border-line bg-panel p-6 shadow-card">
        <Skeleton width="220px" height="18px" />
        <div class="mt-4"><Skeleton width="100%" height="70px" /></div>
      </div>
    {/each}
  </div>
{:else if !clients.length}
  <EmptyState
    align="center"
    icon="briefcase"
    title="No businesses registered yet"
    description="Register the apps that verify payments here. Each one gets its own credential, so every verification can be traced back to who made it."
  />
{:else}
  <div class="flex flex-col gap-5">
    {#each clients as client (client.clientId)}
      <ClientCard
        {client}
        {busy}
        onedit={() => openEdit(client)}
        onrotate={() => openRotate(client)}
        onrevokePrevious={() => askRevokePrevious(client)}
        ontoggleActive={() => toggleActive(client)}
      />
    {/each}
  </div>
{/if}

<ClientFormModal
  bind:open={formOpen}
  client={editing}
  busy={create.isPending || update.isPending}
  error={formError}
  onsubmit={submitForm}
/>

{#if rotating}
  <RotateSecretModal
    bind:open={rotateOpen}
    client={rotating}
    busy={rotate.isPending}
    error={rotateError}
    onsubmit={(secret, graceHours) =>
      rotate.mutate({ clientId: rotating!.clientId, secret, graceHours })}
  />
{/if}

<!-- Deliberately not dismissable by Escape alone doing something quiet: the
     footer button is the only way out, so the secret can't vanish on a stray
     keypress without the admin having seen the warning. -->
{#if reveal}
  <Modal
    open={true}
    title={reveal.rotated ? 'New secret issued' : 'Business registered'}
    onclose={() => (reveal = null)}
  >
    <SecretReveal clientId={reveal.clientId} secret={reveal.secret} rotated={reveal.rotated} />

    {#snippet footer()}
      <Button variant="primary" onclick={() => (reveal = null)}>I've saved it</Button>
    {/snippet}
  </Modal>
{/if}

{#if confirm}
  <ConfirmDialog
    bind:open={confirmOpen}
    icon="key"
    title={confirm.title}
    description={confirm.description}
    confirmLabel={confirm.label}
    onconfirm={confirm.run}
  />
{/if}
