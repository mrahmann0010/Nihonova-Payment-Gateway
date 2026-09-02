<script lang="ts">
  import Button from '$lib/components/Button.svelte';
  import Logo from '$lib/components/Logo.svelte';

  const steps = [
    {
      title: 'SMS arrives',
      body: 'The Android forwarder posts each bKash, Nagad, or Rocket payment text to the webhook the moment it lands.'
    },
    {
      title: 'Parsed & deduped',
      body: 'Every message is parsed into a structured transaction and matched against its trxId — no double-counting.'
    },
    {
      title: 'Verified instantly',
      body: 'Staff confirm a student’s payment against the ledger in seconds, without waiting on a bank statement.'
    }
  ];

  const platforms = [
    { name: 'bKash', cls: 'bg-bkash' },
    { name: 'Nagad', cls: 'bg-nagad' },
    { name: 'Rocket', cls: 'bg-rocket' }
  ];
</script>

<svelte:head>
  <title>Nihonova Academy · Payment gateway</title>
</svelte:head>

<div class="min-h-dvh bg-bg">
  <!-- ============ NAV ============ -->
  <header class="mx-auto flex max-w-shell items-center justify-between px-4 py-6 sm:px-8">
    <div class="flex items-center gap-2.5">
      <Logo size={26} />
      <span class="text-label font-semibold text-ink-mid">Nihonova Academy</span>
    </div>
    <Button href="/dashboard" variant="primary">Admin sign-in</Button>
  </header>

  <!-- ============ HERO ============ -->
  <main class="mx-auto max-w-shell px-4 pt-10 pb-24 sm:px-8">
    <section class="flex flex-col items-start gap-5">
      <span
        class="rounded-full border border-line-strong bg-panel px-3.5 py-1.5 text-small font-semibold tracking-[0.04em] text-ink-mid uppercase shadow-card"
      >
        Payment verification gateway
      </span>
      <h1 class="max-w-2xl text-display font-bold tracking-[-0.02em] text-ink sm:text-display-lg">
        Every mobile-money payment, verified the moment it arrives.
      </h1>
      <p class="max-w-xl text-lede text-ink-mid">
        Nihonova Academy's gateway turns bKash, Nagad, and Rocket SMS confirmations into a live,
        deduplicated ledger — so staff never have to take a student's word for it.
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-3">
        <Button href="/dashboard" variant="primary" size="md">Open admin dashboard</Button>
        <span class="text-small text-ink-soft">Staff access only</span>
      </div>
    </section>

    <!-- ============ PLATFORMS ============ -->
    <section class="mt-16 flex flex-wrap items-center gap-x-8 gap-y-3">
      <span class="text-small font-semibold tracking-[0.04em] text-ink-soft uppercase">
        Tracks payments from
      </span>
      {#each platforms as p (p.name)}
        <span class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 rounded-full {p.cls}" aria-hidden="true"></span>
          <span class="text-body font-semibold text-ink-body">{p.name}</span>
        </span>
      {/each}
    </section>

    <!-- ============ HOW IT WORKS ============ -->
    <section class="mt-20">
      <h2 class="text-section font-bold tracking-[-0.01em] text-ink">How it works</h2>
      <div class="mt-6 grid gap-4 sm:grid-cols-3">
        {#each steps as s, i (s.title)}
          <div class="rounded-panel border border-line bg-panel p-6 shadow-card">
            <div
              class="mono mb-4 grid h-8 w-8 place-items-center rounded-full bg-fill text-label font-semibold text-ink-mid"
            >
              {i + 1}
            </div>
            <h3 class="text-card font-semibold text-ink">{s.title}</h3>
            <p class="mt-1.5 text-label text-ink-mid">{s.body}</p>
          </div>
        {/each}
      </div>
    </section>
  </main>

  <footer class="border-t border-line-soft">
    <div
      class="mx-auto flex max-w-shell flex-col items-center justify-between gap-3 px-4 py-6 text-small text-ink-soft sm:flex-row sm:px-8"
    >
      <span>© {new Date().getFullYear()} Nihonova Academy</span>
      <span>Payment verification gateway</span>
    </div>
  </footer>
</div>
