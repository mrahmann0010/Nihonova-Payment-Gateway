<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    open = $bindable(false),
    title,
    width = 'md',
    padded = true,
    footer,
    children,
    onclose
  }: {
    open?: boolean;
    title?: string;
    width?: 'sm' | 'md';
    padded?: boolean;
    footer?: Snippet;
    children: Snippet;
    onclose?: () => void;
  } = $props();

  function close() {
    open = false;
    onclose?.();
  }

  // Escape closes; the scrim is click-through-to-close via its own handler.
  $effect(() => {
    if (!open) return;
    const onkey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onkey);
    return () => window.removeEventListener('keydown', onkey);
  });
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/32 p-4"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div
      class="w-full {width === 'sm'
        ? 'max-w-90'
        : 'max-w-140'} overflow-hidden rounded-panel bg-panel shadow-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {#if title}
        <header
          class="flex items-center justify-between border-b border-line-soft px-5.5 py-4.5"
        >
          <div class="text-card font-bold">{title}</div>
          <button
            type="button"
            class="grid size-7 cursor-pointer place-items-center rounded-lg bg-fill text-ink-mid hover:text-ink"
            aria-label="Close"
            onclick={close}
          >
            <Icon name="close" size={14} stroke={2.4} />
          </button>
        </header>
      {/if}

      <div class={padded ? 'p-5.5' : ''}>{@render children()}</div>

      {#if footer}
        <div
          class="flex justify-end gap-2.5 border-t border-line-soft bg-recessed px-5.5 py-4"
        >
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
