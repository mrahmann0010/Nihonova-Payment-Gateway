<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'primary' | 'secondary' | 'link' | 'danger';

  let {
    variant = 'secondary',
    size = 'md',
    href,
    type = 'button',
    disabled = false,
    full = false,
    title,
    onclick,
    children
  }: {
    variant?: Variant;
    size?: 'sm' | 'md';
    href?: string;
    type?: 'button' | 'submit';
    disabled?: boolean;
    full?: boolean;
    title?: string;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();

  const base =
    'inline-flex items-center justify-center gap-1.5 font-sans font-semibold whitespace-nowrap ' +
    'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  const sizes = {
    sm: 'px-4 py-2.25 text-ctl',
    md: 'px-4.5 py-2.5 text-ctl'
  };

  const variants = {
    primary: 'rounded-control border border-ink bg-ink text-white hover:bg-ink-body cursor-pointer',
    secondary:
      'rounded-control border border-line-strong bg-panel text-ink-body hover:bg-recessed cursor-pointer',
    danger:
      'rounded-control border border-danger-deep bg-danger-deep text-white hover:bg-danger cursor-pointer',
    link: 'rounded-control border border-transparent text-accent hover:text-accent-deep cursor-pointer'
  };

  const disabledCls =
    'rounded-control border border-line bg-fill text-ink-faint cursor-not-allowed';

  const cls = $derived(
    [
      base,
      variant === 'link' ? 'px-1.5 py-2.5 text-ctl' : sizes[size],
      disabled ? disabledCls : variants[variant],
      full ? 'w-full' : ''
    ].join(' ')
  );
</script>

{#if href && !disabled}
  <a {href} {title} class={cls}>{@render children()}</a>
{:else}
  <button {type} {title} {disabled} {onclick} class={cls}>{@render children()}</button>
{/if}
