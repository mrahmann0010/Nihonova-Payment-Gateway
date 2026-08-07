<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    Chart,
    BarController,
    DoughnutController,
    BarElement,
    ArcElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend
  } from 'chart.js';
  import type { ChartConfiguration } from 'chart.js';

  Chart.register(
    BarController, DoughnutController, BarElement, ArcElement,
    CategoryScale, LinearScale, Tooltip, Legend
  );

  let { config }: { config: ChartConfiguration } = $props();

  let canvas = $state<HTMLCanvasElement>();
  let chart: Chart | undefined;
  let chartType: string | undefined;

  // (Re)build the chart whenever the config changes. Chart.js mutates its
  // input, so we update data/options in place when the type is unchanged.
  $effect(() => {
    if (!canvas) return;
    // `config.data` is built from `$state` (auth.stats), so its nested arrays
    // are reactive proxies. Chart.js calls Object.defineProperty on the data
    // it's given, which throws on state proxies (state_descriptors_fixed) and
    // aborts the render. Snapshot `data` to plain objects first. `options` is
    // left as-is: it isn't proxied and may hold functions (tick/tooltip
    // callbacks) that $state.snapshot can't clone.
    const data = $state.snapshot(config.data) as ChartConfiguration['data'];
    const options = config.options ?? {};
    if (chart && chartType === config.type) {
      chart.data = data;
      chart.options = options;
      chart.update();
    } else {
      chart?.destroy();
      chart = new Chart(canvas, { ...config, data });
      chartType = config.type;
    }
  });

  onDestroy(() => chart?.destroy());
</script>

<!-- Fills its container: the plot height is owned by ChartPanel. -->
<div class="relative h-full w-full">
  <canvas bind:this={canvas}></canvas>
</div>
