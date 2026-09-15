<script lang="ts">
  // Raw SMS on the left, the stored document on the right, and a shared colour
  // per field so the eye can follow "Tk 500.00" straight across to `amount`.
  // Hovering either side lights both.
  import Icon from '../Icon.svelte';

  type Field = 'amount' | 'sender' | 'trx' | 'time' | 'meta';

  interface Seg {
    t: string;
    f?: Field;
  }
  interface Row {
    k: string;
    v: string;
    /** Rendered as a quoted string rather than a bare literal. */
    str?: boolean;
    f?: Field;
  }
  interface Sample {
    id: string;
    name: string;
    dot: string;
    from: string;
    raw: Seg[];
    rows: Row[];
    note: string;
  }

  const samples: Sample[] = [
    {
      id: 'bkash',
      name: 'bKash',
      dot: 'bg-bkash',
      from: '16247',
      raw: [
        { t: 'You have received Tk ' },
        { t: '500.00', f: 'amount' },
        { t: ' from ' },
        { t: '01712345678', f: 'sender' },
        { t: '. Fee Tk ' },
        { t: '0.00', f: 'meta' },
        { t: '. Balance Tk ' },
        { t: '1,200.00', f: 'meta' },
        { t: '. TrxID ' },
        { t: 'AB1234CDEF', f: 'trx' },
        { t: ' at ' },
        { t: '08/06/2026 14:32', f: 'time' }
      ],
      rows: [
        { k: 'platform', v: 'bkash', str: true },
        { k: 'amount', v: '500', f: 'amount' },
        { k: 'sender', v: '01712345678', str: true, f: 'sender' },
        { k: 'fee', v: '0', f: 'meta' },
        { k: 'balance', v: '1200', f: 'meta' },
        { k: 'trxId', v: 'AB1234CDEF', str: true, f: 'trx' },
        { k: 'dateReceived', v: '2026-06-08T08:32:00.000Z', str: true, f: 'time' },
        { k: 'timeReceived', v: '14:32', str: true, f: 'time' }
      ],
      note: 'Send Money, Cash In and merchant Pay Bill each have their own pattern.'
    },
    {
      id: 'nagad',
      name: 'Nagad',
      dot: 'bg-nagad',
      from: '16167',
      raw: [
        { t: 'Money Received.\nAmount: Tk ' },
        { t: '99.00', f: 'amount' },
        { t: '\nSender: ' },
        { t: '01634358056', f: 'sender' },
        { t: '\nRef: ' },
        { t: 'Saom', f: 'meta' },
        { t: '\nTxnID: ' },
        { t: '75HKUOBF', f: 'trx' },
        { t: '\nBalance: Tk ' },
        { t: '1289.43', f: 'meta' },
        { t: '\n' },
        { t: '08/06/2026 19:00', f: 'time' }
      ],
      rows: [
        { k: 'platform', v: 'nagad', str: true },
        { k: 'amount', v: '99', f: 'amount' },
        { k: 'sender', v: '01634358056', str: true, f: 'sender' },
        { k: 'ref', v: 'Saom', str: true, f: 'meta' },
        { k: 'balance', v: '1289.43', f: 'meta' },
        { k: 'trxId', v: '75HKUOBF', str: true, f: 'trx' },
        { k: 'dateReceived', v: '2026-06-08T13:00:00.000Z', str: true, f: 'time' },
        { k: 'timeReceived', v: '19:00', str: true, f: 'time' }
      ],
      note: 'Nagad keeps a free-text Ref line; it survives into its own column.'
    },
    {
      id: 'rocket',
      name: 'Rocket',
      dot: 'bg-rocket',
      from: '16216',
      raw: [
        { t: 'Tk' },
        { t: '99.00', f: 'amount' },
        { t: ' received from A/C:' },
        { t: '***515', f: 'sender' },
        { t: ' Fee:Tk' },
        { t: '0', f: 'meta' },
        { t: ', Your A/C Balance: Tk' },
        { t: '1,145.85', f: 'meta' },
        { t: ' TxnId:' },
        { t: '6606781284', f: 'trx' },
        { t: ' Date:' },
        { t: '08-JUN-26 06:21:43 am', f: 'time' },
        { t: '. Download https://bit.ly/nexuspay' }
      ],
      rows: [
        { k: 'platform', v: 'rocket', str: true },
        { k: 'amount', v: '99', f: 'amount' },
        { k: 'sender', v: '***515', str: true, f: 'sender' },
        { k: 'fee', v: '0', f: 'meta' },
        { k: 'balance', v: '1145.85', f: 'meta' },
        { k: 'trxId', v: '6606781284', str: true, f: 'trx' },
        { k: 'dateReceived', v: '2026-06-08T00:21:43.000Z', str: true, f: 'time' },
        { k: 'timeReceived', v: '06:21:43 am', str: true, f: 'time' }
      ],
      note: 'Rocket masks the sender to an account tail — the ledger stores it verbatim.'
    }
  ];

  // Field colours are semantic, never the platform brands — those stay reserved
  // for the platforms themselves.
  const tones: Record<Field, string> = {
    amount: 'bg-ok-bg text-ok',
    sender: 'bg-accent-bg text-accent-ink',
    trx: 'bg-danger-bg text-danger-ink',
    time: 'bg-warn-bg text-warn-ink',
    meta: 'bg-fill text-ink-deep'
  };
  const rings: Record<Field, string> = {
    amount: 'outline-2 outline-offset-2 outline-ok',
    sender: 'outline-2 outline-offset-2 outline-accent',
    trx: 'outline-2 outline-offset-2 outline-danger',
    time: 'outline-2 outline-offset-2 outline-warning',
    meta: 'outline-2 outline-offset-2 outline-ink-soft'
  };

  let active = $state(0);
  let hot = $state<Field | null>(null);
  let el = $state<HTMLDivElement | null>(null);
  let seen = $state(false);
  let lines = $state(0);

  const sample = $derived(samples[active]);

  $effect(() => {
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          seen = true;
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  });

  // Deal the output rows out one at a time — re-runs whenever the tab changes.
  $effect(() => {
    const total = samples[active].rows.length;
    if (!seen) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      lines = total;
      return;
    }
    lines = 0;
    const id = setInterval(() => {
      if (lines >= total) clearInterval(id);
      else lines += 1;
    }, 110);
    return () => clearInterval(id);
  });

  function pick(i: number) {
    active = i;
    hot = null;
  }
</script>

<div bind:this={el}>
  <!-- Platform tabs -->
  <div class="flex flex-wrap gap-2" role="tablist" aria-label="Sample messages by platform">
    {#each samples as s, i (s.id)}
      <button
        type="button"
        role="tab"
        aria-selected={active === i}
        onclick={() => pick(i)}
        class="flex cursor-pointer items-center gap-2 rounded-control border px-4 py-2.25 text-ctl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent {active ===
        i
          ? 'border-ink bg-ink text-white'
          : 'border-line-strong bg-panel text-ink-body hover:bg-recessed'}"
      >
        <span class="h-2 w-2 rounded-full {s.dot}" aria-hidden="true"></span>
        {s.name}
      </button>
    {/each}
  </div>

  <div class="mt-5 grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
    <!-- ---------- Raw SMS ---------- -->
    <div class="flex flex-col overflow-hidden rounded-panel border border-line bg-panel shadow-card">
      <div class="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
        <span class="text-label font-semibold text-ink-mid">Raw SMS</span>
        <span class="mono text-micro text-ink-soft">from {sample.from}</span>
      </div>
      <div class="flex flex-1 items-center bg-recessed p-5">
        <div
          class="w-full rounded-2xl rounded-tl-md border border-line bg-panel px-4 py-3.5 shadow-card"
        >
          <p class="mono text-small leading-[2.1] whitespace-pre-wrap text-ink-body">
            {#each sample.raw as seg, i (i)}
              {#if seg.f}
                <span
                  class="rounded-[5px] px-[3px] py-0.5 font-semibold transition-all duration-200 {tones[
                    seg.f
                  ]} {hot === seg.f ? rings[seg.f] : ''}"
                  onmouseenter={() => (hot = seg.f ?? null)}
                  onmouseleave={() => (hot = null)}
                  role="presentation">{seg.t}</span
                >
              {:else}{seg.t}{/if}
            {/each}
          </p>
        </div>
      </div>
    </div>

    <!-- ---------- Connector ---------- -->
    <div class="flex items-center justify-center lg:px-1">
      <div
        class="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-2 shadow-card"
      >
        <span class="mono text-micro font-semibold text-ink-mid">parse</span>
        <span class="text-accent"><Icon name="arrow-right" size={15} stroke={2.25} /></span>
      </div>
    </div>

    <!-- ---------- Stored document ---------- -->
    <div class="flex flex-col overflow-hidden rounded-panel border border-line bg-panel shadow-lifted">
      <div class="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
        <span class="text-label font-semibold text-ink-mid">Stored document</span>
        <span class="mono text-micro text-ink-soft">db.{sample.id}</span>
      </div>
      <div class="flex-1 bg-recessed p-5">
        <div class="mono text-small leading-[2.1]">
          <div class="text-ink-soft">{'{'}</div>
          {#each sample.rows as row, i (row.k)}
            <div
              class="flex gap-2 pl-4 transition-[opacity,transform] duration-300"
              style="opacity:{i < lines ? 1 : 0};transform:translateY({i < lines ? 0 : 6}px)"
            >
              <span class="w-[112px] flex-none text-ink-mid">"{row.k}":</span>
              {#if row.f}
                <span
                  class="rounded-[5px] px-[3px] py-0.5 font-semibold transition-all duration-200 {tones[
                    row.f
                  ]} {hot === row.f ? rings[row.f] : ''}"
                  onmouseenter={() => (hot = row.f ?? null)}
                  onmouseleave={() => (hot = null)}
                  role="presentation">{row.str ? `"${row.v}"` : row.v}</span
                >
              {:else}
                <span class="font-semibold text-ink-deep">{row.str ? `"${row.v}"` : row.v}</span>
              {/if}
            </div>
          {/each}
          <div class="text-ink-soft">{'}'}</div>
        </div>
      </div>
      <div
        class="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line-soft bg-panel px-5 py-3"
      >
        <span class="flex items-center gap-1.5 text-meta font-semibold text-ok">
          <Icon name="check" size={13} stroke={2.5} /> Unique on trxId
        </span>
        <span class="mono text-meta text-ink-soft">BDT → UTC on write</span>
      </div>
    </div>
  </div>

  <p class="mt-4 text-label text-ink-soft">{sample.note}</p>
</div>
