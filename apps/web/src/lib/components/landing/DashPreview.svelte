<script lang="ts">
  // A miniature, non-interactive rendering of the real dashboard, in browser
  // chrome. Bars grow and rows deal in once it scrolls into view.
  import Icon from '../Icon.svelte';
  import PlatformDot from '../PlatformDot.svelte';

  const stats = [
    { label: 'Today', value: '৳12,450', sub: '31 payments' },
    { label: 'This week', value: '৳68,900', sub: '184 payments' },
    { label: 'This month', value: '৳284,500', sub: '512 payments' },
    { label: 'Unique senders', value: '347', sub: 'across 3 platforms' }
  ];

  // Height %, then the three platform slices that make up each day's bar.
  const bars = [
    { h: 42, s: [58, 27, 15] },
    { h: 61, s: [49, 34, 17] },
    { h: 38, s: [66, 22, 12] },
    { h: 78, s: [52, 31, 17] },
    { h: 55, s: [61, 25, 14] },
    { h: 92, s: [47, 36, 17] },
    { h: 70, s: [55, 29, 16] },
    { h: 48, s: [63, 24, 13] },
    { h: 83, s: [50, 33, 17] },
    { h: 66, s: [57, 28, 15] },
    { h: 74, s: [53, 30, 17] },
    { h: 96, s: [45, 38, 17] }
  ];
  const slice = ['bg-bkash', 'bg-nagad', 'bg-rocket'];

  const rows = [
    { p: 'bkash', trx: 'AB1234CDEF', sender: '01712345678', amt: '৳500.00', at: '14:32' },
    { p: 'nagad', trx: '75HKUOBF', sender: '01634358056', amt: '৳99.00', at: '19:00' },
    { p: 'rocket', trx: '6606781284', sender: '***515', amt: '৳99.00', at: '06:21' },
    { p: 'bkash', trx: 'CD8842QQZ1', sender: '01988201144', amt: '৳3,500.00', at: '11:07' }
  ];

  let el = $state<HTMLDivElement | null>(null);
  let live = $state(false);

  $effect(() => {
    if (!el || live) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          live = true;
          io.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  });
</script>

<div bind:this={el} class="[perspective:1600px]">
  <div
    class="origin-top transition-transform duration-1000 ease-out"
    style="transform:{live
      ? 'rotateX(0deg) scale(1)'
      : 'rotateX(9deg) scale(0.965)'}"
  >
    <div class="overflow-hidden rounded-panel border border-line bg-panel shadow-overlay">
      <!-- Browser chrome -->
      <div class="flex items-center gap-3 border-b border-line bg-sunken px-4 py-3">
        <div class="flex gap-1.5" aria-hidden="true">
          <span class="h-2.5 w-2.5 rounded-full bg-danger-tint"></span>
          <span class="h-2.5 w-2.5 rounded-full bg-warn-border"></span>
          <span class="h-2.5 w-2.5 rounded-full bg-line-strong"></span>
        </div>
        <div
          class="mono flex flex-1 items-center gap-1.5 truncate rounded-full border border-line bg-panel px-3 py-1 text-micro text-ink-soft"
        >
          <span class="text-ok"><Icon name="lock" size={10} stroke={2.25} /></span>
          nihonova.app/dashboard
        </div>
      </div>

      <!-- Dashboard body -->
      <div class="bg-bg p-4 sm:p-5">
        <!-- Stat row -->
        <div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {#each stats as s, i (s.label)}
            <div
              class="rounded-stat border border-line bg-panel px-3.5 py-3 shadow-card transition-[opacity,transform] duration-500"
              style="transition-delay:{80 * i}ms;opacity:{live ? 1 : 0};transform:translateY({live
                ? 0
                : 10}px)"
            >
              <div class="text-micro font-semibold text-ink-mid">{s.label}</div>
              <div class="mono mt-1.5 text-amount-sm leading-none font-semibold tracking-[-0.02em]">
                {s.value}
              </div>
              <div class="mono mt-1.5 text-micro text-ink-soft">{s.sub}</div>
            </div>
          {/each}
        </div>

        <div class="mt-3 grid gap-3 lg:grid-cols-[1.35fr_1fr]">
          <!-- Chart -->
          <div class="rounded-panel border border-line bg-panel p-4 shadow-card">
            <div class="flex items-center justify-between">
              <span class="text-label font-bold text-ink">Daily volume</span>
              <span class="flex items-center gap-2.5">
                {#each ['bKash', 'Nagad', 'Rocket'] as p, i (p)}
                  <span class="flex items-center gap-1 text-micro text-ink-mid">
                    <span class="h-1.5 w-1.5 rounded-full {slice[i]}" aria-hidden="true"></span>
                    {p}
                  </span>
                {/each}
              </span>
            </div>
            <div class="mt-4 flex h-[110px] items-end gap-1.5">
              {#each bars as b, i (i)}
                <div
                  class="flex flex-1 flex-col justify-end overflow-hidden rounded-[3px] transition-[height] duration-700 ease-out"
                  style="height:{live ? b.h : 4}%;transition-delay:{40 * i}ms"
                >
                  {#each b.s as part, j (j)}
                    <div class="{slice[j]} w-full" style="height:{part}%"></div>
                  {/each}
                </div>
              {/each}
            </div>
            <div class="mono mt-2.5 flex justify-between text-[9.5px] text-ink-faint">
              <span>28 May</span><span>02 Jun</span><span>08 Jun</span>
            </div>
          </div>

          <!-- Ledger -->
          <div class="overflow-hidden rounded-panel border border-line bg-panel shadow-card">
            <div class="border-b border-line-soft px-4 py-3 text-label font-bold text-ink">
              Latest transactions
            </div>
            {#each rows as r, i (r.trx)}
              <div
                class="flex items-center gap-2.5 border-b border-line-faint px-4 py-2.5 transition-[opacity,transform] duration-500 last:border-0"
                style="transition-delay:{420 + 110 * i}ms;opacity:{live
                  ? 1
                  : 0};transform:translateX({live ? 0 : -8}px)"
              >
                <PlatformDot platform={r.p} />
                <div class="min-w-0 flex-1">
                  <div class="mono truncate text-micro font-semibold text-ink">{r.trx}</div>
                  <div class="mono truncate text-[9.5px] text-ink-soft">{r.sender}</div>
                </div>
                <div class="text-right">
                  <div class="mono text-micro font-semibold text-money">{r.amt}</div>
                  <div class="mono text-[9.5px] text-ink-soft">{r.at}</div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
