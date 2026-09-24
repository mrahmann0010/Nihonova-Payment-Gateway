<script lang="ts">
  import type { Snippet } from 'svelte';

  // Label over a control, with room for a hint and an error. Field.svelte is
  // the read-only twin of this — label over a *value*.
  let {
    label,
    hint,
    error,
    required = false,
    children
  }: {
    label: string;
    hint?: string;
    error?: string | null;
    required?: boolean;
    children: Snippet;
  } = $props();
</script>

<div>
  <div class="mb-1.5 flex items-baseline justify-between gap-3">
    <span class="text-label font-semibold text-ink-body">
      {label}{#if required}<span class="ml-0.5 text-danger">*</span>{/if}
    </span>
    {#if hint}<span class="text-nano text-ink-soft">{hint}</span>{/if}
  </div>
  {@render children()}
  {#if error}
    <div class="mt-1.5 text-nano font-medium text-danger-ink">{error}</div>
  {/if}
</div>
