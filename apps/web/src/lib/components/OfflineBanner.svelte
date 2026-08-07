<script lang="ts">
  import { fly } from 'svelte/transition';
  import Icon from './Icon.svelte';

  // `since` is the last successful fetch — what's on screen is that snapshot.
  let { since }: { since?: number } = $props();

  let offline = $state(false);

  $effect(() => {
    const sync = () => (offline = !navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  });

  const stamp = $derived(
    since
      ? new Date(since).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : ''
  );
</script>

{#if offline}
  <div
    class="fixed bottom-6 left-1/2 z-60 -translate-x-1/2"
    transition:fly={{ y: 12, duration: 160 }}
  >
    <div
      class="flex items-center gap-2.5 rounded-full bg-ink-body px-4 py-2 text-white shadow-toast"
      role="status"
    >
      <span class="flex-none text-on-ink-danger"><Icon name="offline" size={15} stroke={2.2} /></span>
      <span class="text-label font-semibold">
        You're offline{stamp ? ` — showing data from ${stamp}` : ''}
      </span>
    </div>
  </div>
{/if}
