<script lang="ts">
  import Icon from './Icon.svelte';

  // Something is actually broken — a silent forwarder, not a quiet day. Always
  // red, always distinguishable at a glance from EmptyState.
  let { title, description }: { title: string; description?: string } = $props();
</script>

<div
  class="flex items-center gap-3.5 rounded-panel border border-danger-border bg-danger-bg px-6 py-5.5"
>
  <div
    class="grid size-9 flex-none place-items-center rounded-control bg-danger-tint text-danger-deep"
  >
    <Icon name="x-box" size={18} />
  </div>
  <div>
    <div class="text-body font-semibold text-danger-ink">{title}</div>
    {#if description}<div class="mt-0.5 text-ident text-danger-mid">{description}</div>{/if}
  </div>
</div>
