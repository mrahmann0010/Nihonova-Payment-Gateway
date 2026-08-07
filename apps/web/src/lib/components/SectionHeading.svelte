<script lang="ts">
  let {
    title,
    note,
    linkLabel,
    linkHref
  }: { title: string; note?: string; linkLabel?: string; linkHref?: string } = $props();
</script>

<div class="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1">
  <div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
    <h2 class="text-section font-bold">{title}</h2>
    {#if note}<span class="text-label text-ink-soft">{note}</span>{/if}
  </div>
  {#if linkLabel && linkHref}
    <a href={linkHref} class="text-label font-semibold">{linkLabel} ›</a>
  {/if}
</div>
