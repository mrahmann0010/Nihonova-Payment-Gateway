<script lang="ts">
  import Icon from './Icon.svelte';

  // A labelled boolean. Unlike Input this carries its own label text, because
  // a checkbox reads as one phrase — the label is the control, not a caption
  // above it, so wrapping it in FormRow would split it in two.
  let {
    checked = $bindable(false),
    label,
    hint
  }: {
    checked?: boolean;
    label: string;
    hint?: string;
  } = $props();
</script>

<label class="flex cursor-pointer items-start gap-2.75 select-none">
  <!-- The native input is the accessible control and the focus target; the
       span beside it is what is actually seen. -->
  <input type="checkbox" class="peer sr-only" bind:checked />
  <span
    class="mt-px flex size-4.5 flex-none items-center justify-center rounded-[5px] border
      border-line-strong bg-recessed text-canvas transition-colors peer-checked:border-accent
      peer-checked:bg-accent peer-focus-visible:border-accent"
  >
    {#if checked}<Icon name="check" size={12} />{/if}
  </span>
  <span class="min-w-0">
    <span class="block text-label font-semibold text-ink-body">{label}</span>
    {#if hint}<span class="mt-0.5 block text-nano text-ink-soft">{hint}</span>{/if}
  </span>
</label>
