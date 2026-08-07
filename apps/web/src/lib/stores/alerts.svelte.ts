// Pipeline-trust + performance alerts shown in the masthead bell. Recomputed
// from the latest stats + health whenever either is refreshed. The layout
// drives `computeFrom` off the stats/health TanStack queries.

import { type Stats, type Health } from '$lib/api';
import { platformLabel } from '$lib/format';
import type { AlertKind } from '$lib/components/AlertBanner.svelte';

export interface Alert {
  kind: AlertKind;
  title: string;
  description: string;
}

class Alerts {
  items = $state<Alert[]>([]);
  open = $state(false);

  computeFrom(stats: Stats | null, health: Health | null) {
    const out: Alert[] = [];
    const p = stats?.periods;
    if (p?.prev7?.amount) {
      const pct = Math.round(((p.last7.amount - p.prev7.amount) / p.prev7.amount) * 100);
      if (pct <= -20)
        out.push({
          kind: 'down',
          title: `Revenue down ${Math.abs(pct)}%`,
          description: 'Over the last 7 days vs the previous 7.'
        });
    }
    for (const f of health?.freshness ?? []) {
      const name = platformLabel(f.name);
      // Never received at all is a different story from "went quiet": one is a
      // platform that was never wired up, the other a forwarder that stopped.
      if (f.hoursSince == null)
        out.push({
          kind: 'warn',
          title: `No ${name} payments yet`,
          description: 'Nothing has ever been received from this platform.'
        });
      else if (f.hoursSince > 6)
        out.push({
          kind: 'down',
          title: `No ${name} in ${Math.round(f.hoursSince)} hours`,
          description: 'The forwarder may be offline.'
        });
    }
    this.items = out;
  }
}

export const alerts = new Alerts();
