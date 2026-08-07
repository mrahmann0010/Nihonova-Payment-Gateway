<script lang="ts">
  let { platform, size = 'md' }: { platform: string; size?: 'md' | 'sm' } = $props();

  // Platform brands, plus the two customer-cohort dots the reports page uses.
  const dots: Record<string, string> = {
    bkash: 'bg-bkash',
    nagad: 'bg-nagad',
    rocket: 'bg-rocket',
    returning: 'bg-money',
    new: 'bg-accent'
  };
</script>

<span
  class="flex-none rounded-full {size === 'sm' ? 'size-1.75' : 'size-2'} {dots[platform] ??
    'bg-ink-soft'}"
></span>
