<script lang="ts">
  // Real excerpts from apps/server, not illustrations. Each specimen carries the
  // file it came from and one margin note explaining the decision it encodes.
  // Tokens are tinted with the on-ink-* palette so the dark band needs no new
  // colour primitives.

  type Tone = 'plain' | 'key' | 'str' | 'num' | 'com' | 'fn' | 'hot';

  interface Tok {
    t: string;
    c?: Tone;
  }
  interface Specimen {
    id: string;
    file: string;
    claim: string;
    note: string;
    lines: Tok[][];
    /** 1-indexed lines that carry the decision — dimmed neighbours point at them. */
    focus: number[];
  }

  const tone: Record<Tone, string> = {
    plain: 'text-on-ink',
    key: 'text-on-ink-link',
    str: 'text-on-ink-ok',
    num: 'text-on-ink-danger',
    com: 'text-ink-soft',
    fn: 'text-white',
    hot: 'text-white font-semibold'
  };

  const specimens: Specimen[] = [
    {
      id: 'dedupe',
      file: 'models/createPaymentModel.js',
      claim: 'A retried SMS cannot double-count a payment.',
      note: 'Idempotency is a database constraint, not a lookup-then-write. There is no window between the check and the insert for a second delivery to slip through.',
      focus: [4, 5, 6],
      lines: [
        [{ t: 'trxId: {', c: 'fn' }],
        [{ t: '  type: ', c: 'plain' }, { t: 'String', c: 'key' }, { t: ',', c: 'plain' }],
        [{ t: '  required: ', c: 'plain' }, { t: 'true', c: 'num' }, { t: ',', c: 'plain' }],
        [{ t: '  ', c: 'plain' }, { t: 'unique', c: 'hot' }, { t: ': ', c: 'plain' }, { t: 'true', c: 'num' }, { t: ',', c: 'plain' }],
        [{ t: '  ', c: 'plain' }, { t: 'index', c: 'hot' }, { t: ': ', c: 'plain' }, { t: 'true', c: 'num' }, { t: ',', c: 'plain' }],
        [{ t: '},', c: 'fn' }],
        [{ t: '', c: 'plain' }],
        [{ t: '// routes/webhook.js — the write is simply attempted.', c: 'com' }],
        [{ t: 'try', c: 'key' }, { t: ' { ', c: 'plain' }, { t: 'await', c: 'key' }, { t: ' doc.', c: 'plain' }, { t: 'save', c: 'fn' }, { t: '(); } ', c: 'plain' }, { t: 'catch', c: 'key' }, { t: ' (err) {', c: 'plain' }],
        [{ t: '  ', c: 'plain' }, { t: 'if', c: 'key' }, { t: ' (err.code === ', c: 'plain' }, { t: '11000', c: 'hot' }, { t: ') {', c: 'plain' }],
        [{ t: '    ', c: 'plain' }, { t: '// Already stored by an earlier delivery. 200, not 500,', c: 'com' }],
        [{ t: '    ', c: 'plain' }, { t: '// so the forwarder stops retrying.', c: 'com' }],
        [{ t: '    ', c: 'plain' }, { t: 'return', c: 'key' }, { t: ' res.', c: 'plain' }, { t: 'status', c: 'fn' }, { t: '(', c: 'plain' }, { t: '200', c: 'num' }, { t: ').', c: 'plain' }, { t: 'json', c: 'fn' }, { t: '({ reason: ', c: 'plain' }, { t: "'duplicate'", c: 'str' }, { t: ' });', c: 'plain' }],
        [{ t: '  }', c: 'plain' }],
        [{ t: '}', c: 'plain' }]
      ]
    },
    {
      id: 'auth',
      file: 'middleware/verifySignature.js',
      claim: 'The webhook secret is compared in constant time.',
      note: 'The Android forwarder cannot sign its requests, so the secret travels as a URL token. Comparing it with a plain === would leak its length and prefix through response timing.',
      focus: [8, 9, 10],
      lines: [
        [{ t: 'const', c: 'key' }, { t: ' expected = Buffer.', c: 'plain' }, { t: 'from', c: 'fn' }, { t: '(secret);', c: 'plain' }],
        [{ t: 'const', c: 'key' }, { t: ' received = Buffer.', c: 'plain' }, { t: 'from', c: 'fn' }, { t: '(token);', c: 'plain' }],
        [{ t: '', c: 'plain' }],
        [{ t: 'if', c: 'key' }, { t: ' (', c: 'plain' }],
        [{ t: '  expected.length !== received.length ||', c: 'plain' }],
        [{ t: '  !crypto.', c: 'plain' }, { t: 'timingSafeEqual', c: 'hot' }, { t: '(expected, received)', c: 'plain' }],
        [{ t: ') {', c: 'plain' }],
        [{ t: '  log.', c: 'plain' }, { t: 'warn', c: 'fn' }, { t: '(', c: 'plain' }, { t: "'AUTH'", c: 'str' }, { t: ', ', c: 'plain' }, { t: "'badtoken'", c: 'str' }, { t: ', { ip: req.ip });', c: 'plain' }],
        [{ t: '  ', c: 'plain' }, { t: 'return', c: 'key' }, { t: ' res.', c: 'plain' }, { t: 'status', c: 'fn' }, { t: '(', c: 'plain' }, { t: '401', c: 'num' }, { t: ').', c: 'plain' }, { t: 'json', c: 'fn' }, { t: '({ error: ', c: 'plain' }, { t: "'Invalid token'", c: 'str' }, { t: ' });', c: 'plain' }],
        [{ t: '}', c: 'plain' }],
        [{ t: '', c: 'plain' }],
        [{ t: '// An unset secret in production fails closed, not open.', c: 'com' }],
        [{ t: 'if', c: 'key' }, { t: ' (isPlaceholder && NODE_ENV === ', c: 'plain' }, { t: "'production'", c: 'str' }, { t: ')', c: 'plain' }],
        [{ t: '  ', c: 'plain' }, { t: 'return', c: 'key' }, { t: ' res.', c: 'plain' }, { t: 'status', c: 'fn' }, { t: '(', c: 'plain' }, { t: '503', c: 'hot' }, { t: ').', c: 'plain' }, { t: 'json', c: 'fn' }, { t: '({ error: ', c: 'plain' }, { t: "'Server misconfigured'", c: 'str' }, { t: ' });', c: 'plain' }]
      ]
    },
    {
      id: 'time',
      file: 'services/timeUtil.js · routes/admin.js',
      claim: 'Stored in UTC, counted in Bangladesh time.',
      note: 'An SMS prints local time with no offset. Storing it verbatim would make every report wrong by six hours; bucketing in UTC would file a 1 AM payment under the previous day.',
      focus: [3, 12],
      lines: [
        [{ t: '// The SMS prints BDT wall-clock time with no offset.', c: 'com' }],
        [{ t: 'function', c: 'key' }, { t: ' ', c: 'plain' }, { t: 'bdtToUtc', c: 'fn' }, { t: '(year, month, day, hour, minute) {', c: 'plain' }],
        [{ t: '  const', c: 'key' }, { t: ' bdtMs = Date.', c: 'plain' }, { t: 'UTC', c: 'fn' }, { t: '(year, month - ', c: 'plain' }, { t: '1', c: 'num' }, { t: ', day, hour, minute);', c: 'plain' }],
        [{ t: '  return', c: 'key' }, { t: ' ', c: 'plain' }, { t: 'new', c: 'key' }, { t: ' ', c: 'plain' }, { t: 'Date', c: 'fn' }, { t: '(bdtMs - ', c: 'plain' }, { t: '6 * 60 * 60 * 1000', c: 'hot' }, { t: ');', c: 'plain' }],
        [{ t: '}', c: 'plain' }],
        [{ t: '', c: 'plain' }],
        [{ t: '// …and every roll-up buckets back at +06:00, in Mongo.', c: 'com' }],
        [{ t: '{ $group: {', c: 'plain' }],
        [{ t: '  _id: { $dateToString: {', c: 'plain' }],
        [{ t: '    format: ', c: 'plain' }, { t: "'%Y-%m-%d'", c: 'str' }, { t: ',', c: 'plain' }],
        [{ t: '    date: ', c: 'plain' }, { t: "'$dateReceived'", c: 'str' }, { t: ',', c: 'plain' }],
        [{ t: '    timezone: ', c: 'plain' }, { t: "BD_TZ", c: 'hot' }, { t: '  ', c: 'plain' }, { t: "// '+06:00'", c: 'com' }],
        [{ t: '  } },', c: 'plain' }],
        [{ t: '  total: { $sum: ', c: 'plain' }, { t: "'$amount'", c: 'str' }, { t: ' }', c: 'plain' }],
        [{ t: '} }', c: 'plain' }]
      ]
    }
  ];

  let active = $state(0);
  const spec = $derived(specimens[active]);
</script>

<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
  <!-- ---------- The listing ---------- -->
  <div class="min-w-0 overflow-hidden rounded-panel border border-on-ink-line bg-ink shadow-overlay">
    <!-- File tabs, styled as an editor strip rather than buttons. -->
    <div class="flex overflow-x-auto border-b border-on-ink-line">
      {#each specimens as s, i (s.id)}
        <button
          type="button"
          onclick={() => (active = i)}
          class="mono flex-none cursor-pointer border-r border-on-ink-line px-4 py-3 text-micro whitespace-nowrap transition-colors focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-on-ink-link {active ===
          i
            ? 'bg-ink-body text-white'
            : 'text-ink-mid hover:text-on-ink'}"
        >
          {s.file.split(' · ')[0].split('/').pop()}
        </button>
      {/each}
      <span class="mono hidden flex-1 items-center justify-end px-4 text-micro text-ink-mid sm:flex">
        apps/server/src/{spec.file}
      </span>
    </div>

    <div class="overflow-x-auto px-3 py-5 sm:px-5">
      <pre class="mono text-small leading-[1.85]"><code
          >{#each spec.lines as line, i (i)}<div
            class="-mx-2 flex gap-4 rounded-[4px] px-2 transition-colors duration-300 {spec.focus.includes(
              i + 1
            )
              ? 'bg-on-ink-line/60'
              : ''}"
          ><span class="w-5 flex-none text-right text-ink-mid select-none">{i + 1}</span><span
            >{#each line as tk, j (j)}<span class={tone[tk.c ?? 'plain']}>{tk.t}</span>{/each}{#if line.length === 1 && line[0].t === ''}&nbsp;{/if}</span
          ></div>{/each}</code
        ></pre>
    </div>
  </div>

  <!-- ---------- What it buys ---------- -->
  <div class="lg:pt-4">
    <p class="text-heading leading-[1.4] font-bold tracking-[-0.02em] text-ink">
      {spec.claim}
    </p>
    <p class="mt-4 text-label leading-[1.7] text-ink-mid">{spec.note}</p>
    <p class="mono mt-6 border-t border-line pt-4 text-micro break-all text-ink-soft">
      apps/server/src/{spec.file}
    </p>
  </div>
</div>
