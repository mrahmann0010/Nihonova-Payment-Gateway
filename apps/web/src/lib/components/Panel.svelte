<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    subtitle,
    lifted = false,
    flush = false,
    actions,
    footer,
    children
  }: {
    title?: string;
    subtitle?: string;
    lifted?: boolean;
    /** Drop the body padding — for tables and lists that own their own rows. */
    flush?: boolean;
    actions?: Snippet;
    footer?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section
  class="overflow-hidden rounded-panel border border-line bg-panel {lifted
    ? 'shadow-lifted'
    : 'shadow-card'}"
>
  {#if title || actions}
    <header
      class="flex items-start justify-between gap-4 {flush
        ? 'border-b border-line-soft px-6 py-4.5'
        : 'px-6 pt-5.5'}"
    >
      <div>
        {#if title}<h2 class="text-card font-bold">{title}</h2>{/if}
        {#if subtitle}<p class="mt-0.75 text-label text-ink-soft">{subtitle}</p>{/if}
      </div>
      {#if actions}<div class="flex flex-none items-center gap-2.5">{@render actions()}</div>{/if}
    </header>
  {/if}

  <div class={flush ? '' : title || actions ? 'px-6 pt-4 pb-5.5' : 'p-5.5 px-6'}>
    {@render children()}
  </div>

  {#if footer}
    <div class="border-t border-line-soft bg-recessed px-6 py-3.25">{@render footer()}</div>
  {/if}
</section>
