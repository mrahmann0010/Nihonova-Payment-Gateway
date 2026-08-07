<script lang="ts">
  import type { Snippet } from 'svelte';
  import PlatformLegend from './PlatformLegend.svelte';

  let {
    title,
    subtitle,
    legend = false,
    height,
    axis = [],
    footer,
    children
  }: {
    title: string;
    subtitle?: string;
    legend?: boolean;
    /** Plot-area height in px — 230 for the daily charts, 170 for peak hours. */
    height: number;
    /** Sparse mono axis strip under the plot; the plot itself draws no x labels. */
    axis?: string[];
    /** Legend rows / totals rendered under the plot, in place of an axis strip. */
    footer?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section
  class="flex flex-col gap-4 rounded-panel border border-line bg-panel px-6 py-5.5 shadow-card"
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <div class="text-card font-bold">{title}</div>
      {#if subtitle}<div class="mt-0.75 text-label text-ink-soft">{subtitle}</div>{/if}
    </div>
    {#if legend}<PlatformLegend />{/if}
  </div>

  <div class="min-h-0 flex-1" style="height:{height}px">{@render children()}</div>

  {#if footer}{@render footer()}{/if}

  {#if axis.length}
    <div class="mono flex justify-between text-micro text-ink-dim">
      {#each axis as a}<span>{a}</span>{/each}
    </div>
  {/if}
</section>
