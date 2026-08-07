<script module lang="ts">
  export interface Delta {
    dir: 'up' | 'down';
    txt: string;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import PlatformDot from './PlatformDot.svelte';

  let {
    label,
    dot,
    count,
    amount,
    /** `null` keeps an empty delta slot so a row of cards stays even; omit it entirely to drop the slot. */
    delta,
    value,
    footer
  }: {
    label: string;
    dot?: string;
    count?: string;
    amount?: string;
    delta?: Delta | null;
    value?: Snippet;
    footer?: Snippet;
  } = $props();

  const deltaTone = { up: 'text-ok', down: 'text-danger-deep' };
</script>

<div class="rounded-stat border border-line bg-panel px-5 py-4.5 shadow-card">
  <div class="mb-3 flex items-center gap-1.75">
    {#if dot}<PlatformDot platform={dot} />{/if}
    <span class="text-label font-semibold text-ink-mid">{label}</span>
  </div>

  {#if value}
    {@render value()}
  {:else}
    <div class="mono text-stat leading-none font-semibold tracking-[-0.02em]">{count}</div>
  {/if}

  {#if amount}
    <div class="mono mt-2 text-label text-ink-soft">{amount}</div>
  {/if}

  {#if delta !== undefined}
    <div class="mt-2.25 text-meta font-semibold {delta ? deltaTone[delta.dir] : 'text-ink-faint'}">
      {delta ? delta.txt : ' '}
    </div>
  {/if}

  {#if footer}{@render footer()}{/if}
</div>
