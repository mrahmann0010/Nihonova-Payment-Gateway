<script lang="ts">
  import Skeleton from './Skeleton.svelte';

  // Matches StatCard's box and rhythm so the grid doesn't shift on load.
  let { delta = true }: { delta?: boolean } = $props();
</script>

<div class="rounded-stat border border-line bg-panel px-5 py-4.5 shadow-card">
  <div class="mb-3"><Skeleton width="52px" height="11px" /></div>
  <Skeleton width="70px" height="26px" />
  <div class="mt-2"><Skeleton width="90px" height="11px" /></div>
  {#if delta}
    <div class="mt-2.25"><Skeleton width="110px" height="11px" /></div>
  {/if}
</div>
