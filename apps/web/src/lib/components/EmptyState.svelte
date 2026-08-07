<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte';

  // Neutral "there is simply nothing here". Never use this for a broken
  // pipeline — that is ErrorState, and the difference is the whole point.
  let {
    title,
    description,
    icon = 'minus-circle',
    align = 'row'
  }: {
    title: string;
    description?: string;
    icon?: IconName;
    align?: 'row' | 'center';
  } = $props();
</script>

{#if align === 'center'}
  <div class="flex flex-col items-center gap-3 px-6 py-11 text-center">
    <div
      class="grid size-10.5 place-items-center rounded-control bg-fill text-ink-soft"
    >
      <Icon name={icon} size={21} />
    </div>
    <div>
      <div class="text-body font-semibold">{title}</div>
      {#if description}
        <div class="mt-0.5 max-w-100 text-ident leading-normal text-ink-mid">{description}</div>
      {/if}
    </div>
  </div>
{:else}
  <div class="flex items-center gap-3.5 rounded-panel border border-line bg-panel px-6 py-5.5">
    <div class="grid size-9 flex-none place-items-center rounded-control bg-fill text-ink-soft">
      <Icon name={icon} size={18} />
    </div>
    <div>
      <div class="text-body font-semibold">{title}</div>
      {#if description}<div class="mt-0.5 text-ident text-ink-mid">{description}</div>{/if}
    </div>
  </div>
{/if}
