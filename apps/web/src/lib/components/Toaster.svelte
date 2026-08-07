<script lang="ts">
  import { fly } from 'svelte/transition';
  import { toasts } from '$lib/stores/toasts.svelte';
  import Toast from './Toast.svelte';
</script>

<div class="pointer-events-none fixed bottom-6 left-6 z-60 flex flex-col gap-3">
  {#each toasts.items as t (t.id)}
    <div class="pointer-events-auto" transition:fly={{ y: 12, duration: 160 }}>
      <Toast toast={t} />
    </div>
  {/each}
</div>
