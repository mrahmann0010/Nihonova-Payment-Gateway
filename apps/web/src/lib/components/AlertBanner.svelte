<script module lang="ts">
  export type AlertKind = 'down' | 'warn' | 'info';
</script>

<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte';

  let {
    kind,
    title,
    description,
    actionLabel,
    actionHref
  }: {
    kind: AlertKind;
    title: string;
    description?: string;
    actionLabel?: string;
    actionHref?: string;
  } = $props();

  const styles: Record<
    AlertKind,
    { box: string; icon: IconName; mark: string; title: string; body: string; link: string }
  > = {
    down: {
      box: 'bg-danger-bg border-danger-border',
      icon: 'x-box',
      mark: 'text-danger-deep',
      title: 'text-danger-ink',
      body: 'text-danger-mid',
      link: 'text-danger-deep hover:text-danger-ink'
    },
    warn: {
      box: 'bg-warn-bg border-warn-border',
      icon: 'warn',
      mark: 'text-warn-text',
      title: 'text-warn-ink',
      body: 'text-warn-text',
      link: 'text-warn-text hover:text-warn-ink'
    },
    info: {
      box: 'bg-accent-bg border-accent-border',
      icon: 'info',
      mark: 'text-accent-deep',
      title: 'text-accent-ink',
      body: 'text-accent',
      link: 'text-accent hover:text-accent-deep'
    }
  };
  const s = $derived(styles[kind]);
</script>

<div class="flex items-start gap-3 rounded-alert border px-4.25 py-3.75 {s.box}">
  <div class="mt-0.25 flex-none {s.mark}"><Icon name={s.icon} size={17} stroke={2.2} /></div>
  <div class="flex-1">
    <div class="text-ctl font-bold {s.title}">{title}</div>
    {#if description}
      <div class="mt-0.5 text-label leading-snug {s.body}">{description}</div>
    {/if}
  </div>
  {#if actionLabel && actionHref}
    <a href={actionHref} class="flex-none text-label font-bold {s.link}">{actionLabel} ›</a>
  {/if}
</div>
