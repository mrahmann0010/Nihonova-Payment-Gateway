<script lang="ts">
  let { size = 26 }: { size?: number } = $props();

  const radius = $derived(Math.round(size * 0.3));
</script>

<div
  class="grid flex-none place-items-center bg-ink font-bold text-white"
  style="width:{size}px;height:{size}px;border-radius:{radius}px;font-size:{Math.round(
    size * 0.46
  )}px"
  aria-hidden="true"
>
  N
</div>
