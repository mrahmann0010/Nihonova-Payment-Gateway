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
    if (chart && chartType === config.type) {
      chart.data = config.data;
      chart.options = config.options ?? {};
      chart.update();
    } else {
      chart?.destroy();
      chart = new Chart(canvas, config);
      chartType = config.type;
    }
  });

  onDestroy(() => chart?.destroy());
</script>

<div class="canvas-box">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .canvas-box {
    position: relative;
    height: 280px;
    width: 100%;
  }
</style>
