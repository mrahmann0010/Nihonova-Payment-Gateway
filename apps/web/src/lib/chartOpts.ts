// Shared Chart.js option builders, themed to the design system's light surfaces.
// The x-axis is deliberately unlabelled: ChartPanel renders the sparse mono
// axis strip below the plot instead, so the chart body stays clean.
import type { ChartOptions, ChartType } from 'chart.js';

const TICK = '#C0BAAD'; // ink-dim
const GRID = '#EFEBE3'; // line-soft
const INK = '#1A1A18';
const MONO = "'JetBrains Mono', ui-monospace, monospace";

export function baseOptions<T extends ChartType = 'bar'>(): ChartOptions<T> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: INK,
        padding: 10,
        cornerRadius: 9,
        titleFont: { family: MONO, size: 11 },
        bodyFont: { family: MONO, size: 12 },
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        usePointStyle: true
      }
    }
  } as ChartOptions<T>;
}

function yAxis(callback?: (v: number | string) => string) {
  return {
    beginAtZero: true,
    border: { display: false },
    grid: { color: GRID, drawTicks: false },
    ticks: {
      color: TICK,
      font: { family: MONO, size: 10 },
      padding: 8,
      maxTicksLimit: 5,
      ...(callback ? { callback } : { precision: 0 })
    }
  };
}

const xAxis = {
  stacked: true,
  border: { display: false },
  grid: { display: false },
  ticks: { display: false }
};

export function stackedBarScales(yCallback?: (v: number | string) => string) {
  return { x: xAxis, y: { ...yAxis(yCallback), stacked: true } };
}

export function plainBarScales() {
  return { x: { ...xAxis, stacked: false }, y: yAxis() };
}

/** Sparse mono labels for ChartPanel's axis strip: first, two interior, last. */
export function axisStrip(labels: string[], picks = 4): string[] {
  if (labels.length <= picks) return labels;
  const step = (labels.length - 1) / (picks - 1);
  return Array.from({ length: picks }, (_, i) => labels[Math.round(i * step)]);
}
