<script module lang="ts">
  // Every icon in the system, as one stroked 24-grid set. Keeping them here
  // means an icon is never re-drawn inline in a page.
  export type IconName =
    | 'check'
    | 'warn'
    | 'x-box'
    | 'info'
    | 'search'
    | 'chevron-down'
    | 'bell'
    | 'close'
    | 'download'
    | 'alert'
    | 'offline'
    | 'minus-circle'
    | 'ledger'
    | 'sign-out'
    | 'arrow-right'
    | 'phone'
    | 'shield'
    | 'code'
    | 'database'
    | 'clock'
    | 'lock'
    | 'layers'
    | 'zap'
    | 'globe';
</script>

<script lang="ts">
  let {
    name,
    size = 16,
    stroke = 2
  }: { name: IconName; size?: number; stroke?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'check'}
    <polyline points="20 6 9 17 4 12" />
  {:else if name === 'warn'}
    <path d="M12 3 2 20h20L12 3z" />
    <line x1="12" y1="10" x2="12" y2="14" />
    <line x1="12" y1="17" x2="12" y2="17" />
  {:else if name === 'x-box'}
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <line x1="9" y1="9" x2="15" y2="15" />
    <line x1="15" y1="9" x2="9" y2="15" />
  {:else if name === 'info'}
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16.5" />
    <line x1="12" y1="7.5" x2="12" y2="7.5" />
  {:else if name === 'alert'}
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="7.5" x2="12" y2="13" />
    <line x1="12" y1="16.5" x2="12" y2="16.5" />
  {:else if name === 'search'}
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.5" y2="16.5" />
  {:else if name === 'chevron-down'}
    <polyline points="6 9 12 15 18 9" />
  {:else if name === 'bell'}
    <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <path d="M10.5 19a2 2 0 0 0 3 0" />
  {:else if name === 'close'}
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  {:else if name === 'download'}
    <path d="M12 3v12" />
    <polyline points="7 11 12 16 17 11" />
    <path d="M4 20h16" />
  {:else if name === 'offline'}
    <path d="M3 3l18 18" />
    <path d="M5 12.5a11 11 0 0 1 4-2.6" />
    <path d="M15 9.9a11 11 0 0 1 4 2.6" />
    <path d="M8.5 16a6 6 0 0 1 7 0" />
    <line x1="12" y1="20" x2="12" y2="20" />
  {:else if name === 'minus-circle'}
    <circle cx="12" cy="12" r="9" />
    <line x1="8" y1="12" x2="16" y2="12" />
  {:else if name === 'ledger'}
    <path d="M4 6h16v12H4z" />
    <line x1="4" y1="10" x2="20" y2="10" />
    <line x1="9" y1="14" x2="15" y2="14" />
  {:else if name === 'sign-out'}
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <polyline points="9 16 4 12 9 8" />
    <line x1="4" y1="12" x2="15" y2="12" />
  {:else if name === 'arrow-right'}
    <line x1="4" y1="12" x2="19" y2="12" />
    <polyline points="13 6 19 12 13 18" />
  {:else if name === 'phone'}
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <line x1="10.5" y1="18.5" x2="13.5" y2="18.5" />
  {:else if name === 'shield'}
    <path d="M12 3l7 3v5.5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6l7-3z" />
    <polyline points="9 12 11 14 15 10" />
  {:else if name === 'code'}
    <polyline points="8.5 8 4.5 12 8.5 16" />
    <polyline points="15.5 8 19.5 12 15.5 16" />
    <line x1="13.5" y1="6" x2="10.5" y2="18" />
  {:else if name === 'database'}
    <ellipse cx="12" cy="6" rx="7.5" ry="3" />
    <path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
    <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
  {:else if name === 'clock'}
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15.5 14" />
  {:else if name === 'lock'}
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  {:else if name === 'layers'}
    <path d="M12 3l8.5 4.5L12 12 3.5 7.5 12 3z" />
    <polyline points="3.5 12.5 12 17 20.5 12.5" />
  {:else if name === 'zap'}
    <path d="M13 3L5 13.5h6L11 21l8-10.5h-6L13 3z" />
  {:else if name === 'globe'}
    <circle cx="12" cy="12" r="9" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
  {/if}
</svg>
