// Shared Chart.js option builders for the dark dashboard theme.
import type { ChartOptions, ChartType } from 'chart.js';

const TICK = '#5C6A86';
const GRID = '#18233D';
const LEGEND = '#94A2BE';

export function baseOptions<T extends ChartType = 'bar'>(): ChartOptions<T> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: LEGEND, font: { size: 11 }, usePointStyle: true, boxWidth: 7 } }
    }
  } as ChartOptions<T>;
}

export function stackedBarScales(yCallback?: (v: number | string) => string) {
  return {
    x: { stacked: true, grid: { display: false }, ticks: { color: TICK, font: { size: 10 } } },
    y: {
      stacked: true,
      beginAtZero: true,
      grid: { color: GRID },
      ticks: {
        color: TICK,
        font: { size: 10 },
        ...(yCallback ? { callback: yCallback } : { precision: 0 })
      }
    }
  };
}

export function plainBarScales() {
  return {
    x: { grid: { display: false }, ticks: { color: TICK, font: { size: 10 } } },
    y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK, precision: 0, font: { size: 10 } } }
  };
}
