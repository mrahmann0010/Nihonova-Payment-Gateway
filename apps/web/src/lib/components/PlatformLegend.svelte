<script lang="ts">
  import { PLATFORMS, platformLabel } from '$lib/format';

  const swatch: Record<string, string> = {
    bkash: 'bg-bkash',
    nagad: 'bg-nagad',
    rocket: 'bg-rocket'
  };
</script>

<div class="flex flex-wrap gap-3.5">
  {#each PLATFORMS as p}
    <span class="inline-flex items-center gap-1.5 text-meta font-semibold text-ink-mid">
      <span class="size-2 rounded-xs {swatch[p]}"></span>{platformLabel(p)}
    </span>
  {/each}
</div>
