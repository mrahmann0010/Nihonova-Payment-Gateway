<script lang="ts">
  // Multi-line sibling of Input.svelte — same shell so a notes field sits
  // flush with the text fields above it.
  let {
    value = $bindable(''),
    placeholder = '',
    rows = 3,
    label
  }: { value?: string; placeholder?: string; rows?: number; label?: string } = $props();
</script>

<div
  class="flex w-full rounded-control border border-line-strong bg-recessed px-3.5
    focus-within:border-accent"
>
  <textarea
    {rows}
    {placeholder}
    aria-label={label ?? placeholder}
    bind:value
    class="min-w-0 flex-1 resize-y border-none bg-transparent py-2.75 text-body leading-normal
      text-ink outline-none placeholder:text-ink-faint"
  ></textarea>
</div>
