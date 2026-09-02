<script lang="ts">
  import { QueryClientProvider, createQuery } from '@tanstack/svelte-query';
  import { auth } from '$lib/stores/auth.svelte';
  import { alerts } from '$lib/stores/alerts.svelte';
  import { api } from '$lib/api';
  import { createQueryClient, keys } from '$lib/query';
  import Masthead from '$lib/components/Masthead.svelte';
  import OfflineBanner from '$lib/components/OfflineBanner.svelte';
  import SignIn from '$lib/components/SignIn.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Toaster from '$lib/components/Toaster.svelte';

  let { children } = $props();

  // One QueryClient for the whole app; pages read it from context.
  const queryClient = createQueryClient();

  // Restore an existing session cookie on first load before deciding what to
  // render — avoids flashing the login screen for an already-signed-in user.
  $effect(() => {
    auth.init();
  });

  // Masthead-bell alerts run off the same polled stats/health queries the pages
  // use. Explicit client (not context) because these live in the layout itself.
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

  // What's on screen when the network drops is whatever last landed.
  const lastFetch = $derived(
    Math.max(statsQuery.dataUpdatedAt ?? 0, healthQuery.dataUpdatedAt ?? 0) || undefined
  );
</script>

<svelte:head>
  <title>Nihonova Academy · Payments admin</title>
</svelte:head>

<QueryClientProvider client={queryClient}>
  {#if !auth.ready}
    <!-- Session probe in flight: hold the masthead's shape rather than flash. -->
    <div class="mx-auto flex max-w-shell flex-col gap-9 px-4 py-8 sm:px-8">
      <div class="flex items-center justify-between">
        <Skeleton width="180px" height="26px" />
        <Skeleton width="320px" height="38px" />
      </div>
      <Skeleton width="100%" height="220px" />
    </div>
  {:else if !auth.authed}
    <SignIn />
  {:else}
    <div class="mx-auto flex max-w-shell flex-col gap-9 px-4 pt-8 pb-20 sm:px-8">
      <Masthead />
      {@render children()}
    </div>
  {/if}

  <Toaster />
  <OfflineBanner since={lastFetch} />
</QueryClientProvider>
