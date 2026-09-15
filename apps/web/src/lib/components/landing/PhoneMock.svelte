<script lang="ts">
  // The hero's Android forwarder: a bKash SMS lands, the app picks it up, the
  // webhook answers 202. Staged with timers rather than scroll — it's above the
  // fold, so it plays once on mount.
  import Icon from '../Icon.svelte';

  // 0 = empty phone, 1 = SMS visible, 2 = forwarding, 3 = accepted.
  let stage = $state(0);

  $effect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      stage = 3;
      return;
    }
    const timers = [
      setTimeout(() => (stage = 1), 350),
      setTimeout(() => (stage = 2), 1250),
      setTimeout(() => (stage = 3), 2150)
    ];
    return () => timers.forEach(clearTimeout);
  });
</script>

<div class="relative mx-auto w-[272px] select-none sm:w-[300px]">
  <!-- Soft accent glow that never quite settles, behind the device. -->
  <div
    class="animate-drift pointer-events-none absolute -inset-14 -z-10 rounded-full bg-accent/12 blur-3xl"
    aria-hidden="true"
  ></div>

  <div class="animate-float">
    <!-- Device shell -->
    <div class="rounded-[38px] border-[7px] border-ink bg-ink p-1 shadow-overlay">
      <div class="overflow-hidden rounded-[31px] bg-recessed">
        <!-- Status bar + notch -->
        <div class="relative flex items-center justify-between bg-ink px-5 pt-2 pb-3">
          <span class="mono text-micro font-semibold text-on-ink">14:32</span>
          <div
            class="absolute top-1.5 left-1/2 h-1.5 w-14 -translate-x-1/2 rounded-full bg-on-ink-line"
            aria-hidden="true"
          ></div>
          <div class="flex items-center gap-1.25 text-on-ink">
            <Icon name="globe" size={10} stroke={2.25} />
            <span class="mono text-micro font-semibold">4G</span>
            <span class="h-2 w-4 rounded-[2px] border border-current" aria-hidden="true"></span>
          </div>
        </div>

        <!-- Messages app header -->
        <div class="flex items-center gap-2.5 border-b border-line bg-panel px-4 py-3">
          <span class="grid h-7 w-7 flex-none place-items-center rounded-full bg-bkash">
            <span class="text-micro font-bold text-white">b</span>
          </span>
          <div class="min-w-0">
            <div class="text-meta font-semibold text-ink">bKash</div>
            <div class="mono text-micro text-ink-soft">16247</div>
          </div>
        </div>

        <!-- Thread -->
        <div class="flex min-h-[248px] flex-col gap-2.5 px-3.5 py-4">
          <div
            class="rounded-2xl rounded-tl-md border border-line-soft bg-panel px-3 py-2 opacity-45 shadow-card"
          >
            <p class="mono text-micro leading-[1.55] text-ink-mid">
              Your bKash Account balance is Tk 700.00
            </p>
          </div>

          {#if stage >= 1}
            <div
              class="animate-sms-in rounded-2xl rounded-tl-md border border-line bg-panel px-3 py-2.5 shadow-lifted"
            >
              <p class="mono text-micro leading-[1.6] text-ink-body">
                You have received <span class="font-semibold text-money">Tk 500.00</span> from
                <span class="font-semibold text-accent">01712345678</span>. Fee Tk 0.00. Balance Tk
                1,200.00. TrxID
                <span class="font-semibold text-ink">AB1234CDEF</span> at 08/06/2026 14:32
              </p>
              <div class="mono mt-1.5 text-right text-[9.5px] text-ink-faint">14:32</div>
            </div>
          {/if}

          <!-- The forwarder's own status strip, docked at the bottom. -->
          <div class="mt-auto">
            {#if stage >= 2}
              <div
                class="animate-sms-in flex items-center gap-2 rounded-control border border-line bg-sunken px-2.5 py-2"
              >
                <span class="relative grid h-4 w-4 flex-none place-items-center">
                  {#if stage === 2}
                    <span
                      class="animate-ring absolute inset-0 rounded-full bg-accent/40"
                      aria-hidden="true"
                    ></span>
                  {/if}
                  <span
                    class="h-1.75 w-1.75 rounded-full {stage >= 3 ? 'bg-money' : 'bg-accent'}"
                    aria-hidden="true"
                  ></span>
                </span>
                <span class="mono truncate text-[9.5px] font-semibold text-ink-deep">
                  POST /webhooks/sms
                </span>
                {#if stage >= 3}
                  <span
                    class="mono ml-auto flex-none rounded-full bg-ok-bg px-1.5 py-0.5 text-[9.5px] font-semibold text-ok"
                  >
                    202
                  </span>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Floating confirmation chip, anchored off the device's lower-right corner. -->
  {#if stage >= 3}
    <div
      class="animate-sms-in absolute -right-4 -bottom-5 flex items-center gap-2 rounded-control border border-line bg-panel px-3 py-2 shadow-lifted sm:-right-10"
    >
      <span class="grid h-6 w-6 flex-none place-items-center rounded-full bg-ok-bg text-ok">
        <Icon name="check" size={13} stroke={2.5} />
      </span>
      <div>
        <div class="mono text-meta font-semibold text-ink">৳500.00</div>
        <div class="text-[10px] text-ink-soft">Logged to ledger</div>
      </div>
    </div>
  {/if}
</div>
