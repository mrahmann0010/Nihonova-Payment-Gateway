<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte';

  let {
    value = $bindable(''),
    type = 'text',
    placeholder = '',
    icon,
    autocomplete,
    mono = false,
    full = true,
    label
  }: {
    value?: string;
    type?: 'text' | 'password' | 'date';
    placeholder?: string;
    icon?: IconName;
    autocomplete?: 'username' | 'current-password';
    mono?: boolean;
    full?: boolean;
    label?: string;
  } = $props();

  const shell =
    'flex items-center gap-2.25 rounded-control border border-line-strong bg-recessed px-3.5 ' +
    'focus-within:border-accent';
  const field =
    'min-w-0 flex-1 border-none bg-transparent py-2.75 text-body text-ink outline-none ' +
    'placeholder:text-ink-faint';
</script>

<div class="{shell} {full ? 'w-full' : ''}">
  {#if icon}
    <span class="flex-none text-ink-soft"><Icon name={icon} /></span>
  {/if}
  <!-- One element per type: `type` can't be a runtime binding alongside bind:value. -->
  {#if type === 'password'}
    <input
      type="password"
      class="{field} {mono ? 'mono' : ''}"
      {placeholder}
      {autocomplete}
      aria-label={label ?? placeholder}
      bind:value
    />
  {:else if type === 'date'}
    <input
      type="date"
      class="{field} mono text-ident"
      {placeholder}
      aria-label={label ?? placeholder}
      bind:value
    />
  {:else}
    <input
      type="text"
      class="{field} {mono ? 'mono' : ''}"
      {placeholder}
      {autocomplete}
      aria-label={label ?? placeholder}
      bind:value
    />
  {/if}
</div>
