<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Input from './Input.svelte';
  import Logo from './Logo.svelte';

  let username = $state('');
  let password = $state('');

  async function signIn(e: Event) {
    e.preventDefault();
    await auth.login(username.trim(), password);
  }
</script>

<main class="grid min-h-dvh place-items-center px-6 py-16">
  <form
    onsubmit={signIn}
    class="flex w-full max-w-95 flex-col items-center rounded-panel border border-line bg-panel px-10 py-8.5 text-center shadow-lifted"
  >
    <div class="mb-3.5"><Logo size={46} /></div>
    <div class="mb-1 text-small font-semibold tracking-[0.04em] text-ink-mid">
      NIHONOVA ACADEMY
    </div>
    <h1 class="text-heading font-bold tracking-[-0.01em]">Admin sign-in</h1>

    {#if auth.expired && !auth.error}
      <div
        class="mt-3.5 flex items-center gap-1.75 rounded-lg bg-warn-bg px-3 py-1.75 text-small font-medium text-warn-text"
      >
        <Icon name="alert" size={13} stroke={2.2} />
        Your session expired — sign in again.
      </div>
    {/if}
    {#if auth.error}
      <div
        class="mt-3.5 flex items-center gap-1.75 rounded-lg bg-danger-bg px-3 py-1.75 text-small font-medium text-danger-deep"
        role="alert"
      >
        <Icon name="alert" size={13} stroke={2.2} />
        {auth.error}
      </div>
    {/if}

    <div class="mt-4.5 flex w-full flex-col gap-2.5">
      <Input bind:value={username} placeholder="Username" autocomplete="username" />
      <Input
        bind:value={password}
        type="password"
        placeholder="Password"
        autocomplete="current-password"
      />
    </div>

    <div class="mt-4 w-full">
      <Button type="submit" variant="primary" full disabled={auth.checking}>
        {auth.checking ? 'Checking…' : 'Sign in'}
      </Button>
    </div>
  </form>
</main>
