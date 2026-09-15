<script lang="ts">
  // The four stations one SMS passes through. When the section scrolls into
  // view the rail draws left-to-right and each station lights in turn; a lit
  // packet then runs the rail on a loop.
  import Icon from '../Icon.svelte';
  import type { IconName } from '../Icon.svelte';

  interface Station {
    icon: IconName;
    step: string;
    title: string;
    code: string;
    body: string;
  }

  const stations: Station[] = [
    {
      icon: 'phone',
      step: '01',
      title: 'The SMS lands',
      code: 'Android forwarder',
      body: 'A payment text arrives on the academy handset. The forwarder app picks it up and posts the raw body onward — no screenshots, no manual entry.'
    },
    {
      icon: 'shield',
      step: '02',
      title: 'Authenticated webhook',
      code: 'POST /webhooks/sms',
      body: 'The shared secret is compared against WEBHOOK_SECRET in constant time before a single byte is parsed. An unset secret in production fails closed, not open.'
    },
    {
      icon: 'code',
      step: '03',
      title: 'Parsed to structure',
      code: 'parsePayment()',
      body: 'One of three regex parsers pulls out amount, sender, fee, balance and trxId — and converts the SMS’s Bangladesh local time to UTC on the way in.'
    },
    {
      icon: 'database',
      step: '04',
      title: 'Stored & deduped',
      code: 'MongoDB',
      body: 'Written to that platform’s own collection. A unique index on trxId makes a redelivered SMS a no-op, so a retry can never double-count a payment.'
    }
  ];

  let el = $state<HTMLDivElement | null>(null);
  let lit = $state(-1);
  let drawn = $state(false);

  $effect(() => {
    if (!el || drawn) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        drawn = true;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          lit = stations.length - 1;
          return;
        }
        timers = stations.map((_, i) => setTimeout(() => (lit = i), 260 * i + 220));
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  });

  const nodeOn = 'border-accent bg-accent text-white shadow-lifted';
  const nodeOff = 'border-line-strong bg-panel text-ink-faint';
</script>

<div bind:this={el}>
  <!-- ---------- Wide: nodes on one rail, cards beneath ---------- -->
  <div class="relative hidden md:block">
    <!-- Rail. Insets land on the centre of the first and last node. -->
    <div class="absolute top-8 right-[12.5%] left-[12.5%] h-px bg-line-strong" aria-hidden="true">
      <div
        class="h-px origin-left bg-accent transition-transform duration-[1500ms] ease-out"
        style="transform:scaleX({drawn ? 1 : 0})"
      ></div>
    </div>

    {#if drawn}
      <!-- Full-width runner: translating it 100% of itself walks the dot end to end. -->
      <div
        class="pointer-events-none absolute top-8 right-[12.5%] left-[12.5%]"
        aria-hidden="true"
      >
        <div class="animate-packet w-full">
          <div class="h-2 w-2 -translate-x-1 -translate-y-1 rounded-full bg-accent shadow-lifted">
            <div class="h-2 w-2 animate-ping rounded-full bg-accent/60"></div>
          </div>
        </div>
      </div>
    {/if}

    <div class="grid grid-cols-4 gap-5">
      {#each stations as s, i (s.step)}
        <div class="flex flex-col items-center text-center">
          <div
            class="relative z-10 grid h-16 w-16 place-items-center rounded-full border-2 transition-all duration-500 {i <=
            lit
              ? nodeOn
              : nodeOff}"
          >
            <Icon name={s.icon} size={24} stroke={1.75} />
          </div>

          <div
            class="mt-5 flex-1 rounded-panel border border-line bg-panel p-5 text-left transition-all duration-500 {i <=
            lit
              ? 'opacity-100 shadow-lifted'
              : 'opacity-45 shadow-card'}"
          >
            <div class="mono text-micro font-semibold tracking-[0.1em] text-ink-faint">
              {s.step}
            </div>
            <h3 class="mt-2 text-card font-bold text-ink">{s.title}</h3>
            <div
              class="mono mt-2 inline-block rounded-md bg-fill px-2 py-1 text-micro font-semibold text-ink-deep"
            >
              {s.code}
            </div>
            <p class="mt-3 text-label leading-[1.6] text-ink-mid">{s.body}</p>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- ---------- Narrow: the rail stands up ---------- -->
  <div class="relative md:hidden">
    <div class="absolute top-8 bottom-8 left-8 w-px bg-line-strong" aria-hidden="true">
      <div
        class="w-px origin-top bg-accent transition-transform duration-[1500ms] ease-out"
        style="height:100%;transform:scaleY({drawn ? 1 : 0})"
      ></div>
    </div>

    {#if drawn}
      <div class="pointer-events-none absolute top-8 bottom-8 left-8" aria-hidden="true">
        <div class="animate-packet-y h-full">
          <div class="h-2 w-2 -translate-x-1 -translate-y-1 rounded-full bg-accent shadow-lifted">
            <div class="h-2 w-2 animate-ping rounded-full bg-accent/60"></div>
          </div>
        </div>
      </div>
    {/if}

    <div class="flex flex-col gap-5">
      {#each stations as s, i (s.step)}
        <div class="flex gap-4">
          <div
            class="relative z-10 mt-1 grid h-16 w-16 flex-none place-items-center rounded-full border-2 transition-all duration-500 {i <=
            lit
              ? nodeOn
              : nodeOff}"
          >
            <Icon name={s.icon} size={24} stroke={1.75} />
          </div>
          <div
            class="flex-1 rounded-panel border border-line bg-panel p-5 transition-all duration-500 {i <=
            lit
              ? 'opacity-100 shadow-lifted'
              : 'opacity-45 shadow-card'}"
          >
            <div class="mono text-micro font-semibold tracking-[0.1em] text-ink-faint">
              {s.step}
            </div>
            <h3 class="mt-2 text-card font-bold text-ink">{s.title}</h3>
            <div
              class="mono mt-2 inline-block rounded-md bg-fill px-2 py-1 text-micro font-semibold text-ink-deep"
            >
              {s.code}
            </div>
            <p class="mt-3 text-label leading-[1.6] text-ink-mid">{s.body}</p>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
