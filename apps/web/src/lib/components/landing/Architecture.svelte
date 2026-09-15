<script lang="ts">
  // The real module map, named exactly as the repo names it. Three tiers —
  // ingest, store, read — separated by rules rather than boxed into cards, so
  // the diagram reads as one system instead of nine components.
  import Icon from '../Icon.svelte';
  import type { IconName } from '../Icon.svelte';

  interface Node {
    label: string;
    path?: string;
    icon?: IconName;
    /** Platform-branded leaf (a payment collection). */
    dot?: string;
  }

  interface Tier {
    id: string;
    name: string;
    detail: string;
    nodes: Node[];
  }

  const tiers: Tier[] = [
    {
      id: 'ingest',
      name: 'Ingest',
      detail: 'Untrusted input, checked before it is read',
      nodes: [
        { label: 'Android forwarder', path: 'on the academy handset', icon: 'phone' },
        { label: 'POST /webhooks/sms', path: 'routes/webhook.js', icon: 'globe' },
        { label: 'verifySignature', path: 'timingSafeEqual on WEBHOOK_SECRET', icon: 'shield' },
        { label: 'parsePayment', path: 'services/parsePayment.js', icon: 'code' }
      ]
    },
    {
      id: 'store',
      name: 'Store',
      detail: 'One collection per platform, unique on trxId',
      nodes: [
        { label: 'bkash', path: 'models/Bkash.js', dot: 'bg-bkash' },
        { label: 'nagad', path: 'models/Nagad.js', dot: 'bg-nagad' },
        { label: 'rocket', path: 'models/Rocket.js', dot: 'bg-rocket' },
        { label: 'webhookevents', path: 'ingestion health', icon: 'bell' }
      ]
    },
    {
      id: 'read',
      name: 'Read',
      detail: 'Credentialed JSON, no token in JavaScript',
      nodes: [
        { label: 'requireAdmin', path: 'httpOnly JWT cookie', icon: 'lock' },
        { label: '/admin/api/*', path: 'routes/admin.js — fans out across all three', icon: 'layers' },
        { label: 'TanStack Query', path: 'lib/query.ts', icon: 'zap' },
        { label: 'Dashboard', path: 'SvelteKit 2 · Svelte 5 runes', icon: 'ledger' }
      ]
    }
  ];
</script>

<div class="overflow-hidden rounded-panel border border-line bg-panel shadow-lifted">
  {#each tiers as tier, ti (tier.id)}
    <div class="border-t border-line first:border-t-0 {ti === 1 ? 'bg-recessed' : ''}">
      <div class="grid gap-x-8 gap-y-5 px-5 py-7 sm:px-7 lg:grid-cols-[168px_minmax(0,1fr)]">
        <!-- Tier label -->
        <div class="lg:pt-1">
          <div class="text-section leading-none font-bold tracking-[-0.02em] text-ink">
            {tier.name}
          </div>
          <p class="mt-2 text-small leading-[1.6] text-ink-mid">{tier.detail}</p>
        </div>

        <!-- Nodes on a rail -->
        <div class="relative">
          <!-- Rail runs centre-to-centre: four columns, each icon 40px wide at
               its column's left edge, so the last centre sits at 75% + 20px. -->
          <div
            class="pointer-events-none absolute top-5 left-5 hidden h-px bg-line-strong md:right-[calc(25%-20px)] md:block"
            aria-hidden="true"
          ></div>

          <div class="relative grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {#each tier.nodes as n, i (n.label)}
              <div class="flex gap-3 md:block">
                <span
                  class="grid h-10 w-10 flex-none place-items-center rounded-full border border-line-strong bg-panel text-ink-deep shadow-card"
                >
                  {#if n.dot}
                    <span class="h-3 w-3 rounded-full {n.dot}" aria-hidden="true"></span>
                  {:else if n.icon}
                    <Icon name={n.icon} size={17} stroke={1.75} />
                  {/if}
                </span>
                <div class="min-w-0 md:mt-3">
                  <div class="mono text-ident leading-tight font-semibold break-words text-ink">
                    {n.label}
                  </div>
                  {#if n.path}
                    <div class="mt-1.5 text-small leading-[1.5] text-ink-soft">{n.path}</div>
                  {/if}
                </div>
                {#if i < tier.nodes.length - 1}
                  <span class="sr-only">then</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/each}
</div>
