<script lang="ts">
  import type { Toast, ToastTone } from '$lib/stores/toasts.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  let { toast }: { toast: Toast } = $props();

  const tones: Record<ToastTone, { icon: IconName; cls: string; stroke: number }> = {
    ok: { icon: 'check', cls: 'text-on-ink-ok', stroke: 2.6 },
    info: { icon: 'download', cls: 'text-on-ink', stroke: 2.2 },
    error: { icon: 'alert', cls: 'text-on-ink-danger', stroke: 2.4 }
  };
  const t = $derived(tones[toast.tone]);
</script>

<div
  class="flex items-center gap-2.75 rounded-alert bg-ink px-4 py-3.25 text-white shadow-toast"
  role="status"
>
  <span class="flex-none {t.cls}"><Icon name={t.icon} stroke={t.stroke} /></span>
  <span class="flex-1 text-ctl font-medium">{toast.text}</span>
  {#if toast.action}
    <button
      type="button"
      class="flex-none cursor-pointer text-label font-bold text-on-ink-link"
      onclick={toast.action.run}>{toast.action.label}</button
    >
  {/if}
</div>
