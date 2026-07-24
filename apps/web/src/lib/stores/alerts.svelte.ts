// Pipeline-trust + performance alerts shown in the nav bell. Recomputed from
// the latest stats + health whenever either is refreshed. Ported from the old
// Alpine `alerts` store.

import { api, type Stats, type Health } from '$lib/api';
import { platformLabel } from '$lib/format';

export interface Alert { cls: 'down' | 'warn'; text: string }

class Alerts {
  items = $state<Alert[]>([]);
  open = $state(false);

  computeFrom(stats: Stats | null, health: Health | null) {
    const out: Alert[] = [];
    const p = stats?.periods;
    if (p?.prev7?.amount) {
      const pct = Math.round(((p.last7.amount - p.prev7.amount) / p.prev7.amount) * 100);
      if (pct <= -20) out.push({ cls: 'down', text: `Revenue down ${Math.abs(pct)}% over the last 7 days vs the previous 7.` });
    }
    for (const f of health?.freshness ?? []) {
      const name = platformLabel(f.name);
      if (f.hoursSince == null) out.push({ cls: 'warn', text: `No ${name} transactions have ever been received.` });
      else if (f.hoursSince > 6) out.push({ cls: 'warn', text: `No ${name} transactions received in ${Math.round(f.hoursSince)} hours.` });
    }
    this.items = out;
  }

  async load(token: string, stats: Stats | null) {
    try {
      const health = await api.health(token);
      this.computeFrom(stats, health);
    } catch {
      /* non-fatal — bell just stays empty */
    }
  }
}

export const alerts = new Alerts();
