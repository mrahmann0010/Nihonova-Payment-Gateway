<script lang="ts">
  import { alerts } from '$lib/stores/alerts.svelte';
  import Icon from './Icon.svelte';

  const marks = { down: 'text-danger-deep', warn: 'text-warning', info: 'text-accent-deep' };
  const icons = { down: 'x-box', warn: 'warn', info: 'info' } as const;

  let wrap = $state<HTMLElement>();

  // Close on an outside click so the dropdown never sits over the page.
  $effect(() => {
    if (!alerts.open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap && !wrap.contains(e.target as Node)) alerts.open = false;
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  });
</script>

<div class="relative" bind:this={wrap}>
  <button
    type="button"
    class="relative grid size-9 cursor-pointer place-items-center rounded-control border bg-panel
      {alerts.items.length ? 'border-danger-border text-ink' : 'border-line text-ink-mid'}
      hover:text-ink"
    aria-label="Alerts"
    aria-expanded={alerts.open}
    onclick={() => (alerts.open = !alerts.open)}
  >
    <Icon name="bell" size={17} />
    {#if alerts.items.length}
      <span
        class="mono absolute -top-1.5 -right-1.5 rounded-full bg-danger px-1.5 text-micro leading-4 font-bold text-white"
        >{alerts.items.length}</span
      >
    {/if}
  </button>

  {#if alerts.open}
    <div
      class="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-24px)] overflow-hidden
        rounded-panel border border-line bg-panel shadow-dropdown"
    >
      <div class="flex items-center justify-between border-b border-line-soft px-4.5 py-3.5">
        <span class="text-ident font-bold">Alerts</span>
        {#if alerts.items.length}
          <span class="mono rounded-full bg-danger px-2 py-0.5 text-nano font-bold text-white"
            >{alerts.items.length}</span
          >
        {/if}
      </div>

      {#if !alerts.items.length}
        <div class="px-4.5 py-4 text-label text-ink-mid">
          Nothing to flag — every platform is receiving.
        </div>
      {:else}
        {#each alerts.items as a, i}
          <div
            class="flex gap-3 px-4.5 py-3.5 {i < alerts.items.length - 1
              ? 'border-b border-line-faint'
              : ''}"
          >
            <div class="mt-0.25 flex-none {marks[a.kind]}">
              <Icon name={icons[a.kind]} size={18} stroke={2.2} />
            </div>
            <div>
              <div class="text-ident leading-snug font-semibold text-ink">{a.title}</div>
              <div class="mt-0.5 text-label leading-snug text-ink-mid">{a.description}</div>
            </div>
          </div>
        {/each}
      {/if}

      <a
        href="/health"
        class="block border-t border-line-soft bg-recessed px-4.5 py-3.25 text-label font-semibold"
        onclick={() => (alerts.open = false)}>View pipeline health ›</a
      >
    </div>
  {/if}
</div>
