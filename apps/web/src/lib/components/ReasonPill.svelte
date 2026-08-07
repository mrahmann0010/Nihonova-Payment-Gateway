<script lang="ts">
  // Webhook-event reasons from the ingestion log.
  let { reason }: { reason: string } = $props();

  const styles: Record<string, string> = {
    unmatched: 'bg-warn-bg text-warn-text',
    duplicate: 'bg-accent-tint text-accent-deep',
    unknown_sender: 'bg-fill-deep text-ink-deep',
    error: 'bg-down-bg text-down'
  };
</script>

<span
  class="inline-flex flex-none items-center rounded-full px-3 py-1.25 text-small font-semibold {styles[
    reason
  ] ?? 'bg-fill-deep text-ink-deep'}"
>
  {reason.replace(/_/g, ' ')}
</span>
