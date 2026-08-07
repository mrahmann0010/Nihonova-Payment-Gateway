<script lang="ts">
  let {
    value = $bindable(''),
    options,
    label,
    onchange
  }: {
    value?: string;
    options: { value: string; label: string }[];
    label?: string;
    /** For callers that need to act on a pick, not just track the value. */
    onchange?: (value: string) => void;
  } = $props();

  function select(v: string) {
    value = v;
    onchange?.(v);
  }
</script>

<div
  class="inline-flex self-start rounded-[11px] bg-fill p-0.75"
  role="radiogroup"
  aria-label={label}
>
  {#each options as o (o.value)}
    <button
      type="button"
      role="radio"
      aria-checked={value === o.value}
      class="cursor-pointer rounded-lg px-3.75 py-2 text-ident whitespace-nowrap {value === o.value
        ? 'bg-panel font-semibold text-ink shadow-card'
        : 'font-medium text-ink-mid hover:text-ink'}"
      onclick={() => select(o.value)}
    >
      {o.label}
    </button>
  {/each}
</div>
