<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    meta,
    subtitle,
    actions
  }: {
    title: string;
    /** Mono line under the title — timestamps, ranges, counts. */
    meta?: string;
    /** Prose line under the title, when there's no timestamp to show. */
    subtitle?: string;
    actions?: Snippet;
  } = $props();
</script>

<div
  class="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-5"
>
  <div>
    <h1 class="text-title leading-[1.05] font-bold tracking-[-0.03em]">{title}</h1>
    {#if meta}<div class="mono mt-2 text-small text-ink-soft">{meta}</div>{/if}
    {#if subtitle}<div class="mt-2 text-body text-ink-mid">{subtitle}</div>{/if}
  </div>
  {#if actions}
    <div class="flex flex-wrap items-center gap-2.5">{@render actions()}</div>
  {/if}
</div>
