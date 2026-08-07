<script module lang="ts">
  export type StatusKind = 'ok' | 'warn' | 'down';

  /** Hours since the last SMS → pipeline status. <2h fine, 2–6h flagged, >6h broken. */
  export function freshnessKind(hoursSince: number | null | undefined): StatusKind {
    if (hoursSince == null) return 'down';
    if (hoursSince < 2) return 'ok';
    if (hoursSince < 6) return 'warn';
    return 'down';
  }
</script>

<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte';

  // Status is never colour alone — every state carries its own icon and label.
  let {
    kind,
    label,
    wide = false
  }: { kind: StatusKind; label: string; wide?: boolean } = $props();

  const styles: Record<StatusKind, { cls: string; icon: IconName; stroke: number }> = {
    ok: { cls: 'bg-ok-bg text-ok', icon: 'check', stroke: 3 },
    warn: { cls: 'bg-warn-bg text-warn-text', icon: 'warn', stroke: 2.4 },
    down: { cls: 'bg-down-bg text-down', icon: 'x-box', stroke: 2.4 }
  };
</script>

<span
  class="inline-flex items-center gap-1.5 rounded-full px-2.75 py-1.25 text-meta font-bold {styles[
    kind
  ].cls} {wide ? 'min-w-26 justify-center' : ''}"
>
  <Icon name={styles[kind].icon} size={12} stroke={styles[kind].stroke} />
  {label}
</span>
