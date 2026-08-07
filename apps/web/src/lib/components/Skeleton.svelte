<script lang="ts">
  // One shimmering placeholder block. Sizing comes in as props so the same
  // primitive covers text lines, number blocks, pills and chart bodies.
  let {
    width = '100%',
    height = '1rem',
    round = 'md'
  }: { width?: string; height?: string; round?: 'md' | 'full' } = $props();
</script>

<span
  class="block bg-linear-to-r from-fill-deep via-shimmer to-fill-deep bg-[size:320px_100%]
    animate-shimmer motion-reduce:animate-none {round === 'full' ? 'rounded-full' : 'rounded-md'}"
  style="width:{width};height:{height}"
  aria-hidden="true"
></span>
