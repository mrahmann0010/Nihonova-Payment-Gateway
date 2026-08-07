<script lang="ts">
  // Label-over-value pair. Blank values render an em-dash in ink-faint so an
  // empty reference never reads as a rendering bug.
  let {
    label,
    value,
    strong = false
  }: { label: string; value?: string | number | null; strong?: boolean } = $props();

  const shown = $derived(value === null || value === undefined || value === '' ? null : String(value));
</script>

<div>
  <div class="mb-1 text-nano text-ink-soft">{label}</div>
  <div class="mono text-ident {shown ? (strong ? 'font-medium text-ink' : 'text-ink') : 'text-ink-faint'}">
    {shown ?? '—'}
  </div>
</div>
