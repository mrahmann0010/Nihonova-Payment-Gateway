<script lang="ts">
  import { platformLabel } from '$lib/format';

  let { platform, size = 'md' }: { platform: string; size?: 'md' | 'sm' } = $props();

  // Static maps: Tailwind can't see class names built at runtime.
  const tint: Record<string, string> = {
    bkash: 'bg-bkash/10 text-bkash',
    nagad: 'bg-nagad/10 text-nagad',
    rocket: 'bg-rocket/10 text-rocket'
  };
  const dot: Record<string, string> = {
    bkash: 'bg-bkash',
    nagad: 'bg-nagad',
    rocket: 'bg-rocket'
  };
  const unknown = 'bg-fill text-ink-mid';

  const sizes = {
    md: { pill: 'gap-1.75 px-3.25 py-1.5 text-ident', dot: 'size-1.75' },
    sm: { pill: 'gap-1.5 px-2.25 py-1 text-meta', dot: 'size-1.25' }
  };
</script>

<span
  class="inline-flex flex-none items-center rounded-full font-semibold {sizes[size]
    .pill} {tint[platform] ?? unknown}"
>
  <span class="rounded-full {sizes[size].dot} {dot[platform] ?? 'bg-ink-soft'}"></span>
  {platformLabel(platform)}
</span>
