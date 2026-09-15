<script lang="ts">
  // Scroll-entrance wrapper for the landing page. Fires once, then disconnects —
  // sections never re-animate when the reader scrolls back up.
  import type { Snippet } from 'svelte';

  let {
    delay = 0,
    y = 18,
    class: cls = '',
    children
  }: { delay?: number; y?: number; class?: string; children: Snippet } = $props();

  let el = $state<HTMLDivElement | null>(null);
  let shown = $state(false);

  $effect(() => {
    if (!el || shown) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          shown = true;
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  });
</script>

<div
  bind:this={el}
  class="transition-[opacity,transform] duration-700 ease-out will-change-transform {cls}"
  style="transition-delay:{delay}ms;opacity:{shown ? 1 : 0};transform:translateY({shown ? 0 : y}px)"
>
  {@render children()}
</div>
