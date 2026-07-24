<script lang="ts">
  import '$lib/app.css';
  import { page } from '$app/state';
  import { QueryClientProvider, createQuery } from '@tanstack/svelte-query';
  import { auth } from '$lib/stores/auth.svelte';
  import { alerts } from '$lib/stores/alerts.svelte';
  import { api } from '$lib/api';
  import { createQueryClient, keys } from '$lib/query';

  let { children } = $props();

  // One QueryClient for the whole app; pages read it from context.
  const queryClient = createQueryClient();

  let username = $state('');
  let password = $state('');
  async function signIn(e: Event) {
    e.preventDefault();
    await auth.login(username.trim(), password);
  }

  // Restore an existing session cookie on first load before deciding what to
  // render — avoids flashing the login screen for an already-signed-in user.
  $effect(() => {
    auth.init();
  });

  // Nav-bell alerts run off the same polled stats/health queries the pages use.
  // Explicit client (not context) because these live in the layout itself.
  const statsQuery = createQuery(
    () => ({ queryKey: keys.stats, queryFn: api.stats, enabled: auth.authed }),
    () => queryClient
  );
  const healthQuery = createQuery(
    () => ({ queryKey: keys.health, queryFn: api.health, enabled: auth.authed }),
    () => queryClient
  );
  $effect(() => {
    alerts.computeFrom(statsQuery.data ?? null, healthQuery.data ?? null);
  });

  const tabs = [
    { href: '/', label: 'Dashboard' },
    { href: '/transactions', label: 'Transactions' },
    { href: '/reports', label: 'Reports' },
    { href: '/health', label: 'Health' }
  ];
</script>

<svelte:head>
  <title>SMS Payments · Admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
  />
</svelte:head>

<QueryClientProvider client={queryClient}>
{#if !auth.ready}
  <main class="gate"><p class="muted">Loading…</p></main>
{:else if !auth.authed}
  <main class="gate">
    <h1>Admin sign-in</h1>
    <p class="muted">Enter your username and password to continue.</p>
    <form onsubmit={signIn}>
      <input type="text" placeholder="Username" bind:value={username} autocomplete="username" />
      <input type="password" placeholder="Password" bind:value={password} autocomplete="current-password" />
      <button class="btn" type="submit" disabled={auth.checking}>
        {auth.checking ? 'Checking…' : 'Sign in'}
      </button>
    </form>
    {#if auth.error}<p class="err">{auth.error}</p>{/if}
  </main>
{:else}
  <header class="topbar">
    <div class="wrap bar-inner">
      <nav class="tabs">
        {#each tabs as t}
          <a href={t.href} class:active={page.url.pathname === t.href}>{t.label}</a>
        {/each}
      </nav>

      <div class="right">
      <div class="bell-wrap">
        <button class="bell" class:has={alerts.items.length} onclick={() => (alerts.open = !alerts.open)}>
          🔔{#if alerts.items.length}<span class="badge">{alerts.items.length}</span>{/if}
        </button>
        {#if alerts.open}
          <div class="dropdown">
            <div class="dd-head">Alerts</div>
            {#if !alerts.items.length}
              <div class="dd-empty">No issues right now.</div>
            {:else}
              {#each alerts.items as a}
                <div class="dd-item {a.cls}">{a.text}</div>
              {/each}
            {/if}
            <a class="dd-link" href="/health">View pipeline health ›</a>
          </div>
        {/if}
      </div>

      <button class="logout" onclick={() => auth.logout()} title="Sign out">Sign out</button>
      </div>
    </div>
  </header>

  <main class="wrap">
    {@render children()}
  </main>
{/if}
</QueryClientProvider>

<style>
  .gate { max-width: 360px; margin: 12vh auto 0; padding: 0 20px; }
  .gate form { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
  .err { color: #f87171; margin-top: 10px; }

  .topbar { border-bottom: 1px solid var(--border); background: var(--panel-2); }
  .bar-inner { display: flex; justify-content: space-between; align-items: center; height: 56px; }
  .tabs { display: flex; gap: 4px; }
  .tabs a {
    padding: 8px 14px; border-radius: 8px; text-decoration: none;
    color: var(--muted); font-size: 0.9rem; font-weight: 500;
  }
  .tabs a.active { background: var(--panel); color: var(--text); }

  .right { display: flex; align-items: center; gap: 10px; }
  .logout {
    background: transparent; border: 1px solid var(--border); border-radius: 8px;
    padding: 6px 12px; cursor: pointer; color: var(--muted); font-size: 0.85rem;
  }
  .logout:hover { color: var(--text); border-color: var(--accent); }

  .bell-wrap { position: relative; }
  .bell {
    position: relative; background: transparent; border: 1px solid var(--border);
    border-radius: 8px; padding: 6px 10px; cursor: pointer; font-size: 1rem;
  }
  .bell.has { border-color: var(--accent); }
  .badge {
    position: absolute; top: -6px; right: -6px; background: #f87171; color: #fff;
    border-radius: 999px; font-size: 0.68rem; padding: 0 5px; font-weight: 700;
  }
  .dropdown {
    position: absolute; right: 0; top: 44px; width: 300px; z-index: 10;
    background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
    padding: 10px; box-shadow: 0 12px 40px rgba(0,0,0,0.4);
  }
  .dd-head { font-weight: 600; padding: 4px 6px 8px; }
  .dd-empty { color: var(--muted); padding: 10px 6px; font-size: 0.88rem; }
  .dd-item { padding: 8px 10px; border-radius: 8px; font-size: 0.84rem; margin-bottom: 4px; }
  .dd-item.down { background: rgba(248,113,113,0.12); color: #fca5a5; }
  .dd-item.warn { background: rgba(251,191,36,0.12); color: #fcd34d; }
  .dd-link { display: block; padding: 8px 6px 2px; color: var(--accent); text-decoration: none; font-size: 0.85rem; }
</style>
