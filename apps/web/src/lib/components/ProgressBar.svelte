<script lang="ts">
  // `percent` omitted → indeterminate (a refresh is in flight, length unknown).
  let { label, percent }: { label?: string; percent?: number } = $props();
</script>

<div>
  {#if label}
    <div class="mb-2.25 flex justify-between">
      <span class="text-label font-semibold text-ink-mid">{label}</span>
      {#if percent != null}<span class="mono text-small text-ink-soft">{percent}%</span>{/if}
    </div>
  {/if}
  <div class="h-1 overflow-hidden rounded-full bg-fill-deep">
    {#if percent == null}
      <div class="h-full w-[38%] animate-indet rounded-full bg-accent motion-reduce:animate-none"></div>
    {:else}
      <div class="h-full rounded-full bg-ink" style="width:{percent}%"></div>
    {/if}
  </div>
</div>
