// Shared TanStack Query setup. A single QueryClient drives every page:
// queries poll in the background (REFRESH_MS) and refetch on window focus, so
// a transaction landing in the DB shows up on screen without a manual reload.

import { QueryClient } from '@tanstack/svelte-query';
import { ApiError } from '$lib/api';
import { auth } from '$lib/stores/auth.svelte';

// How often background polling re-checks the server for new data. Kept long to
// stay light on the API — window-focus refetch still gives a near-instant
// update whenever someone actually looks at a tab.
export const REFRESH_MS = 10 * 60_000;

// Query keys — one place so invalidation/refetch stay consistent.
export const keys = {
  stats: ['stats'] as const,
  health: ['health'] as const,
  payments: (params: Record<string, string | number>) => ['payments', params] as const,
  reports: (from: string, to: string) => ['reports', { from, to }] as const
};

export function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        refetchInterval: REFRESH_MS,
        refetchOnWindowFocus: true,
        staleTime: 5_000,
        // A dropped session shouldn't be retried forever — bounce to sign-in.
        retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2
      }
    }
  });

  // Any query that 401s means the cookie is gone — sign the user out globally.
  client.getQueryCache().subscribe((event) => {
    const err = event.query.state.error;
    if (err instanceof ApiError && err.status === 401 && auth.authed) auth.logout();
  });

  return client;
}
