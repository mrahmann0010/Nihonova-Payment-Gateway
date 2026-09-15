<script lang="ts">
  import Logo from '$lib/components/Logo.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Reveal from '$lib/components/landing/Reveal.svelte';
  import PhoneMock from '$lib/components/landing/PhoneMock.svelte';
  import Pipeline from '$lib/components/landing/Pipeline.svelte';
  import ParseDemo from '$lib/components/landing/ParseDemo.svelte';
  import CodeSpecimen from '$lib/components/landing/CodeSpecimen.svelte';
  import Architecture from '$lib/components/landing/Architecture.svelte';
  import DashPreview from '$lib/components/landing/DashPreview.svelte';

  // Edit here to change the byline; it is the only place the author is named.
  const author = 'Moshiur Rahman';

  const platforms = [
    { name: 'bKash', dot: 'bg-bkash' },
    { name: 'Nagad', dot: 'bg-nagad' },
    { name: 'Rocket', dot: 'bg-rocket' }
  ];

  // Properties of the system, true on day one and at any volume — not traffic
  // figures, which would date the page and prove nothing about the build.
  const guarantees = [
    {
      value: '6',
      unit: 'SMS shapes',
      body: 'bKash alone prints four: Send Money, Cash In, merchant Pay Bill and internet-banking deposit. Nagad and Rocket add one each. Every shape has its own tested regex.'
    },
    {
      value: '1',
      unit: 'unique index',
      body: 'Deduplication is a constraint on trxId, not a lookup. The forwarder may redeliver the same text forever; the ledger absorbs it and answers 200.'
    },
    {
      value: '+06:00',
      unit: 'every roll-up',
      body: 'Timestamps store as UTC and every per-day aggregate groups in Bangladesh time, so a payment made at 1 AM is counted on the day the student made it.'
    },
    {
      value: '0',
      unit: 'tokens in JavaScript',
      body: 'The dashboard session is an httpOnly cookie no script can read, behind credentialed CORS that echoes one exact origin and never a wildcard.'
    }
  ];

  // The manual process this replaced, step for step against what runs now.
  const before = [
    'Student pays, screenshots the confirmation, sends the image on WhatsApp',
    'Staff open the bKash, Nagad or Rocket app and hunt for a matching line',
    'Transaction ID is retyped into a spreadsheet, one digit at a time',
    'A forwarded screenshot from last week reads exactly like a new one',
    'Nobody can say what came in today without adding it up by hand'
  ];
  const after = [
    'The handset forwards the confirmation the moment it arrives',
    'The parser resolves platform, amount, sender and trxId in milliseconds',
    'The row is written to that platform’s collection — no typing anywhere',
    'A repeat of the same trxId is rejected by the index before it is stored',
    'Today, this week and this month are already totalled on the dashboard'
  ];

  const stack = [
    { group: 'API', items: ['Node.js', 'Express 5', 'Mongoose 9', 'MongoDB'] },
    { group: 'Dashboard', items: ['SvelteKit 2', 'Svelte 5 runes', 'TanStack Query v6', 'Chart.js'] },
    { group: 'Styling', items: ['Tailwind v4', 'Design tokens', 'JetBrains Mono'] },
    { group: 'Shipping', items: ['Vercel', 'adapter-vercel', 'Node 20'] }
  ];

  const nav = [
    ['Problem', '#problem'],
    ['Pipeline', '#pipeline'],
    ['Parsing', '#parsing'],
    ['Code', '#code'],
    ['Architecture', '#architecture']
  ];

  let scrolled = $state(false);
</script>

<svelte:head>
  <title>Nihonova Academy · Payment verification gateway</title>
  <meta
    name="description"
    content="A payment-verification gateway that turns bKash, Nagad and Rocket SMS confirmations into a live, deduplicated ledger. Express 5, MongoDB and a Svelte 5 dashboard."
  />
</svelte:head>

<svelte:window onscroll={() => (scrolled = window.scrollY > 12)} />

<div class="min-h-dvh bg-bg">
  <!-- ==================== NAV ==================== -->
  <header
    class="sticky top-0 z-30 transition-colors duration-300 {scrolled
      ? 'border-b border-line bg-bg/85 backdrop-blur-md'
      : 'border-b border-transparent'}"
  >
    <div class="mx-auto flex max-w-shell items-center justify-between px-4 py-4 sm:px-8">
      <a href="/" class="flex items-center gap-2.5">
        <Logo size={26} />
        <span class="text-label font-semibold text-ink">Nihonova Academy</span>
      </a>
      <nav class="hidden items-center gap-6 lg:flex">
        {#each nav as [label, href] (href)}
          <a {href} class="text-label font-semibold text-ink-mid hover:text-ink">{label}</a>
        {/each}
      </nav>
      <span class="text-label text-ink-soft">
        Built by <span class="font-semibold text-ink-body">{author}</span>
      </span>
    </div>
  </header>

  <main>
    <!-- ==================== HERO ==================== -->
    <section class="relative overflow-hidden">
      <!-- Dotted field, faded out toward the page body. -->
      <div
        class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--color-line-strong)_1px,transparent_0)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_75%_60%_at_50%_25%,black,transparent)]"
        aria-hidden="true"
      ></div>

      <div
        class="relative mx-auto grid max-w-shell items-center gap-14 px-4 pt-14 pb-20 sm:px-8 lg:grid-cols-[1.05fr_auto] lg:gap-12 lg:pt-24 lg:pb-28"
      >
        <div>
          <Reveal>
            <h1
              class="max-w-4xl text-display leading-[1.03] font-bold tracking-[-0.035em] text-ink sm:text-display-lg lg:text-display-xl"
            >
              <span class="block">Every mobile-money payment,</span>
              <span class="block text-accent">verified the second it arrives.</span>
            </h1>
          </Reveal>

          <Reveal delay={90}>
            <p class="mt-7 max-w-xl text-lede leading-[1.7] text-ink-mid">
              An Android handset forwards each bKash, Nagad and Rocket confirmation to a
              token-authenticated webhook. Milliseconds later it is a structured, deduplicated
              transaction on the ledger — no screenshots, no spreadsheets, no taking a student’s word
              for it.
            </p>
          </Reveal>

          <Reveal delay={170}>
            <!-- The build's own facts, stated as a line rather than a stat row. -->
            <dl
              class="mt-9 flex flex-wrap gap-x-10 gap-y-4 border-y border-line py-5 text-ink-body"
            >
              {#each [['Two-app monorepo', 'Express 5 · SvelteKit 2'], ['Payment platforms', 'bKash · Nagad · Rocket'], ['Data entry', 'None']] as [k, v] (k)}
                <div>
                  <dt class="text-small text-ink-soft">{k}</dt>
                  <dd class="mono mt-1 text-body font-semibold text-ink">{v}</dd>
                </div>
              {/each}
            </dl>
          </Reveal>

          <Reveal delay={250}>
            <div class="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3">
              <a
                href="#problem"
                class="inline-flex items-center gap-2 rounded-control border border-ink bg-ink px-5 py-3 text-ctl font-semibold text-white transition-colors hover:bg-ink-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Read the build
                <Icon name="arrow-right" size={15} stroke={2.25} />
              </a>
              <span class="flex flex-wrap items-center gap-x-5 gap-y-2">
                {#each platforms as p (p.name)}
                  <span class="flex items-center gap-2">
                    <span class="h-2.5 w-2.5 rounded-full {p.dot}" aria-hidden="true"></span>
                    <span class="text-body font-semibold text-ink-body">{p.name}</span>
                  </span>
                {/each}
              </span>
            </div>
          </Reveal>
        </div>

        <Reveal delay={180} y={28}>
          <PhoneMock />
        </Reveal>
      </div>
    </section>

    <!-- ==================== PROBLEM ==================== -->
    <section id="problem" class="scroll-mt-20 border-y border-line bg-panel">
      <div class="mx-auto max-w-shell px-4 py-20 sm:px-8 lg:py-24">
        <Reveal>
          <div class="max-w-3xl">
            <h2 class="text-title leading-[1.12] font-bold tracking-[-0.03em] text-ink sm:text-hero">
              Before this existed, a payment was verified by squinting at a screenshot.
            </h2>
            <p class="mt-5 max-w-xl text-lede leading-[1.7] text-ink-mid">
              Nihonova Academy takes course fees over mobile money. The verification step — not the
              payment — was the part that broke.
            </p>
          </div>
        </Reveal>

        <div class="mt-14 grid gap-px overflow-hidden rounded-panel border border-line bg-line lg:grid-cols-2">
          <!-- Before -->
          <div class="bg-recessed p-6 sm:p-8">
            <div class="flex items-center gap-2.5 text-down">
              <Icon name="minus-circle" size={17} stroke={2} />
              <span class="text-label font-bold tracking-[0.02em] uppercase">The old way</span>
            </div>
            <ol class="mt-6 space-y-4">
              {#each before as step, i (step)}
                <li class="flex gap-3.5">
                  <span class="mono mt-0.5 w-4 flex-none text-meta text-ink-faint">{i + 1}</span>
                  <span class="text-body leading-[1.6] text-ink-mid">{step}</span>
                </li>
              {/each}
            </ol>
            <p class="mono mt-7 border-t border-line-soft pt-5 text-meta text-ink-soft">
              Minutes per payment · mistakes invisible until reconciliation
            </p>
          </div>

          <!-- After -->
          <div class="bg-panel p-6 sm:p-8">
            <div class="flex items-center gap-2.5 text-ok">
              <Icon name="check" size={17} stroke={2.25} />
              <span class="text-label font-bold tracking-[0.02em] uppercase">What runs now</span>
            </div>
            <ol class="mt-6 space-y-4">
              {#each after as step, i (step)}
                <li class="flex gap-3.5">
                  <span class="mono mt-0.5 w-4 flex-none text-meta text-accent">{i + 1}</span>
                  <span class="text-body leading-[1.6] text-ink-body">{step}</span>
                </li>
              {/each}
            </ol>
            <p class="mono mt-7 border-t border-line-soft pt-5 text-meta text-ink-soft">
              One webhook round trip · nothing typed by a human
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== PIPELINE ==================== -->
    <section id="pipeline" class="scroll-mt-20">
      <div class="mx-auto max-w-shell px-4 py-20 sm:px-8 lg:py-24">
        <Reveal>
          <div class="max-w-3xl">
            <h2 class="text-title leading-[1.12] font-bold tracking-[-0.03em] text-ink sm:text-hero">
              From a phone in Dhaka to a row on the ledger.
            </h2>
            <p class="mt-5 max-w-xl text-lede leading-[1.7] text-ink-mid">
              Four hops, all of them automatic. The slowest part of the whole chain is the mobile
              network delivering the SMS.
            </p>
          </div>
        </Reveal>

        <div class="mt-14">
          <Pipeline />
        </div>
      </div>
    </section>

    <!-- ==================== PARSING ==================== -->
    <section id="parsing" class="scroll-mt-20 border-y border-line bg-recessed">
      <div class="mx-auto max-w-shell px-4 py-20 sm:px-8 lg:py-24">
        <Reveal>
          <div class="max-w-3xl">
            <h2 class="text-title leading-[1.12] font-bold tracking-[-0.03em] text-ink sm:text-hero">
              Three providers. Three formats. One shape.
            </h2>
            <p class="mt-5 max-w-xl text-lede leading-[1.7] text-ink-mid">
              bKash writes one long line, Nagad writes labelled lines, Rocket masks the sender to an
              account tail. Each gets its own parser, and all three land in the same normalised
              document. Hover a value to trace it across.
            </p>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div class="mt-12">
            <ParseDemo />
          </div>
        </Reveal>
      </div>
    </section>

    <!-- ==================== CODE SPECIMEN — the technical peak ==================== -->
    <section id="code" class="scroll-mt-20">
      <div class="mx-auto max-w-shell px-4 py-20 sm:px-8 lg:py-24">
        <Reveal>
          <div class="max-w-3xl">
            <h2 class="text-title leading-[1.12] font-bold tracking-[-0.03em] text-ink sm:text-hero">
              Three decisions that carry the whole thing.
            </h2>
            <p class="mt-5 max-w-xl text-lede leading-[1.7] text-ink-mid">
              Money makes correctness non-negotiable. These are lifted verbatim from the running
              server — the file each one lives in is named beside it.
            </p>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div class="mt-12">
            <CodeSpecimen />
          </div>
        </Reveal>
      </div>
    </section>

    <!-- ==================== GUARANTEES ==================== -->
    <section class="border-y border-line bg-panel">
      <div class="mx-auto max-w-shell px-4 py-20 sm:px-8 lg:py-24">
        <Reveal>
          <h2
            class="max-w-3xl text-title leading-[1.12] font-bold tracking-[-0.03em] text-ink sm:text-hero"
          >
            What the system promises, at any volume.
          </h2>
        </Reveal>

        <dl class="mt-12 divide-y divide-line border-t border-line">
          {#each guarantees as g, i (g.unit)}
            <Reveal delay={i * 70}>
              <div class="grid gap-x-10 gap-y-3 py-7 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                <dt class="flex items-baseline gap-3">
                  <span
                    class="mono text-stat leading-none font-semibold tracking-[-0.03em] text-accent"
                  >
                    {g.value}
                  </span>
                  <span class="text-card font-bold text-ink">{g.unit}</span>
                </dt>
                <dd class="max-w-2xl text-body leading-[1.7] text-ink-mid">{g.body}</dd>
              </div>
            </Reveal>
          {/each}
        </dl>
      </div>
    </section>

    <!-- ==================== ARCHITECTURE ==================== -->
    <section id="architecture" class="scroll-mt-20">
      <div class="mx-auto max-w-shell px-4 py-20 sm:px-8 lg:py-24">
        <Reveal>
          <div class="max-w-3xl">
            <h2 class="text-title leading-[1.12] font-bold tracking-[-0.03em] text-ink sm:text-hero">
              Twelve modules, named as the repo names them.
            </h2>
            <p class="mt-5 max-w-xl text-lede leading-[1.7] text-ink-mid">
              Two apps, no shared root package. The server never renders a page; the dashboard never
              touches the database.
            </p>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div class="mt-12">
            <Architecture />
          </div>
        </Reveal>
      </div>
    </section>

    <!-- ==================== DASHBOARD ==================== -->
    <section class="border-y border-line bg-recessed">
      <div class="mx-auto max-w-shell px-4 py-20 sm:px-8 lg:py-24">
        <Reveal>
          <div class="max-w-3xl">
            <h2 class="text-title leading-[1.12] font-bold tracking-[-0.03em] text-ink sm:text-hero">
              The ledger, live.
            </h2>
            <p class="mt-5 max-w-xl text-lede leading-[1.7] text-ink-mid">
              Totals by day, week and month; volume split by platform; and a searchable ledger where
              a student’s transaction ID resolves in one keystroke. Below is the real interface —
              access is staff-only, so this is where it can be seen.
            </p>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div class="mt-12">
            <DashPreview />
          </div>
        </Reveal>
      </div>
    </section>

    <!-- ==================== BUILD CONTEXT ==================== -->
    <section class="bg-bg">
      <div class="mx-auto max-w-shell px-4 py-20 sm:px-8 lg:py-24">
        <div class="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <Reveal>
            <div>
              <h2
                class="text-title leading-[1.12] font-bold tracking-[-0.03em] text-ink sm:text-hero"
              >
                Designed and built by {author}.
              </h2>
              <p class="mt-5 max-w-lg text-lede leading-[1.7] text-ink-mid">
                Sole engineer and designer: the SMS parsers, the webhook API, the aggregation
                queries, the design system and every screen of the dashboard. Built for a real
                academy taking real course fees, and running in production.
              </p>
              <dl class="mt-9 grid gap-6 border-t border-line pt-7 sm:grid-cols-2">
                {#each [['Role', 'Full-stack · design'], ['Scope', 'Server, dashboard, design system'], ['Users', 'Academy admin staff'], ['Status', 'In production']] as [k, v] (k)}
                  <div>
                    <dt class="text-small text-ink-soft">{k}</dt>
                    <dd class="mt-1.5 text-body font-semibold text-ink">{v}</dd>
                  </div>
                {/each}
              </dl>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div class="rounded-panel border border-line bg-panel p-6 shadow-card sm:p-8">
              <div class="grid gap-7 sm:grid-cols-2">
                {#each stack as s (s.group)}
                  <div>
                    <div class="text-label font-bold text-ink">{s.group}</div>
                    <ul class="mt-3 space-y-2">
                      {#each s.items as item (item)}
                        <li class="mono text-ident text-ink-mid">{item}</li>
                      {/each}
                    </ul>
                  </div>
                {/each}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  </main>

  <footer class="border-t border-line bg-panel">
    <div
      class="mx-auto flex max-w-shell flex-col items-center justify-between gap-3 px-4 py-8 text-small text-ink-soft sm:flex-row sm:px-8"
    >
      <span class="flex items-center gap-2.5">
        <Logo size={20} />
        © {new Date().getFullYear()} Nihonova Academy
      </span>
      <span>Payment verification gateway · built by {author}</span>
    </div>
  </footer>
</div>
