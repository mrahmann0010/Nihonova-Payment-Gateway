<script lang="ts">
  import '$lib/app.css';

  let { children } = $props();
</script>

<svelte:head>
  <title>Nihonova Academy · Payment gateway</title>
</svelte:head>

{@render children()}
