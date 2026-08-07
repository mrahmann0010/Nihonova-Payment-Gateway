<script lang="ts">
  let { size = 15 }: { size?: number } = $props();
</script>

<span
  class="block flex-none animate-spin rounded-full border-2 border-fill-deep border-t-accent motion-reduce:animate-none"
  style="width:{size}px;height:{size}px"
  aria-hidden="true"
></span>
