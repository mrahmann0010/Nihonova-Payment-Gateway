<script lang="ts">
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  // Panel error boundary: the request failed. Deliberately *not* the red
  // ErrorState — the payment data is fine, this is a display problem.
  let {
    title = "Couldn't load this panel",
    description = 'The dashboard reached the server but the response failed. Your payment data is safe — this is a display problem.',
    meta,
    onRetry
  }: {
    title?: string;
    description?: string;
    meta?: string;
    onRetry?: () => void;
  } = $props();
</script>

<div
  class="flex flex-col items-center rounded-panel border border-line bg-panel px-7 py-11 text-center shadow-card"
>
  <div class="mb-4 grid size-10.5 place-items-center rounded-control bg-fill text-ink-mid">
    <Icon name="ledger" size={21} />
  </div>
  <div class="text-card font-bold">{title}</div>
  <p class="mt-1.25 max-w-100 text-ctl leading-normal text-ink-mid">{description}</p>
  {#if meta}<div class="mono mt-3 text-meta text-ink-dim">{meta}</div>{/if}
  {#if onRetry}
    <div class="mt-5 flex gap-2.5">
      <Button variant="primary" onclick={onRetry}>Try again</Button>
    </div>
  {/if}
</div>
