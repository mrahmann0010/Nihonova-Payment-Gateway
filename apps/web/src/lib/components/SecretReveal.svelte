<script lang="ts">
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  // Shown once, right after a secret is set or rotated, then gone.
  //
  // There is no "reveal" anywhere else in the dashboard because there is
  // nothing to reveal: the server only ever stored a SHA-256 digest, and this
  // value exists solely in this browser tab. Closing the dialog loses it for
  // good, and the only recovery is another rotation.
  let {
    clientId,
    secret,
    rotated = false
  }: { clientId: string; secret: string; rotated?: boolean } = $props();

  const envBlock = $derived(
    `PAYMENT_CLIENT_ID=${clientId}\nPAYMENT_CLIENT_SECRET=${secret}`
  );

  let copied = $state('');
  async function copy(what: 'secret' | 'env', text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
      setTimeout(() => (copied = ''), 1800);
    } catch {
      /* clipboard blocked — both values are selectable on screen */
    }
  }
</script>

<div class="flex flex-col gap-4">
  <div
    class="flex items-start gap-3 rounded-alert border border-warn-border bg-warn-bg px-4 py-3.25"
  >
    <span class="mt-0.25 flex-none text-warn-ink"><Icon name="warn" size={16} stroke={2.2} /></span>
    <div>
      <div class="text-ctl font-bold text-warn-ink">
        This is the only time this secret is shown
      </div>
      <p class="mt-0.5 text-label leading-normal text-warn-text">
        The server stored only a hash of it — it cannot be looked up again, by anyone. Copy it into
        {clientId}'s environment now. If you lose it, rotate to issue a new one.
      </p>
    </div>
  </div>

  <div>
    <div class="mb-1.5 text-label font-semibold text-ink-body">Secret</div>
    <div class="flex items-start gap-2 rounded-control border border-line-strong bg-recessed p-3.25">
      <code class="mono min-w-0 flex-1 text-ident break-all text-ink">{secret}</code>
      <button
        type="button"
        onclick={() => copy('secret', secret)}
        title="Copy secret"
        aria-label="Copy secret"
        class="flex-none cursor-pointer text-ink-soft hover:text-ink"
      >
        <Icon name={copied === 'secret' ? 'check' : 'copy'} size={15} />
      </button>
    </div>
  </div>

  <div>
    <div class="mb-1.5 flex items-baseline justify-between gap-3">
      <span class="text-label font-semibold text-ink-body">Environment variables</span>
      <span class="text-nano text-ink-soft">paste into the consuming app</span>
    </div>
    <div class="flex items-start gap-2 rounded-control border border-line-strong bg-recessed p-3.25">
      <pre class="mono min-w-0 flex-1 text-ident break-all whitespace-pre-wrap text-ink">{envBlock}</pre>
      <button
        type="button"
        onclick={() => copy('env', envBlock)}
        title="Copy both variables"
        aria-label="Copy both variables"
        class="flex-none cursor-pointer text-ink-soft hover:text-ink"
      >
        <Icon name={copied === 'env' ? 'check' : 'copy'} size={15} />
      </button>
    </div>
  </div>

  {#if rotated}
    <p class="text-label leading-normal text-ink-mid">
      The previous secret still works until its grace window closes, so deploy this one before then.
      If the old secret leaked, end the window now with <strong class="font-semibold text-ink-body"
        >Revoke old secret</strong
      > on the client's row.
    </p>
  {/if}

  <div class="flex justify-end">
    <Button variant="link" onclick={() => copy('env', envBlock)}>
      {copied === 'env' ? 'Copied' : 'Copy both'}
    </Button>
  </div>
</div>
