<script lang="ts">
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import { generateSecret, strengthScore, validateSecret, MIN_LENGTH } from '$lib/secret';

  // The secret is typed by the admin, or generated here in the browser — never
  // by the server, which is what keeps the plaintext off the wire in both
  // directions. It stays visible rather than masked: the admin has to copy it
  // into the consuming app's env, and a dot-masked field they can't read is
  // just a field they paste wrong.
  let {
    value = $bindable(''),
    clientId = '',
    touched = false
  }: { value?: string; clientId?: string; touched?: boolean } = $props();

  const score = $derived(strengthScore(value));
  const problem = $derived(value ? validateSecret(value, clientId) : null);

  // Only complain once they've engaged with the field — an empty form that is
  // already shouting reads as broken.
  const shown = $derived(touched && value ? problem : null);

  let copied = $state(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      /* clipboard blocked — the value is on screen to select by hand */
    }
  }

  const barTone = $derived(score >= 4 ? 'bg-ok' : score >= 2 ? 'bg-warning' : 'bg-danger');
</script>

<div class="flex flex-col gap-2">
  <div class="flex gap-2">
    <div
      class="flex min-w-0 flex-1 items-center gap-2.25 rounded-control border border-line-strong
        bg-recessed px-3.5 focus-within:border-accent"
    >
      <span class="flex-none text-ink-soft"><Icon name="key" /></span>
      <input
        type="text"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        aria-label="Client secret"
        placeholder="At least {MIN_LENGTH} characters"
        bind:value
        class="mono min-w-0 flex-1 border-none bg-transparent py-2.75 text-ident text-ink
          outline-none placeholder:font-sans placeholder:text-ink-faint"
      />
      {#if value}
        <button
          type="button"
          onclick={copy}
          title="Copy secret"
          aria-label="Copy secret"
          class="flex-none cursor-pointer text-ink-soft hover:text-ink"
        >
          <Icon name={copied ? 'check' : 'copy'} size={15} />
        </button>
      {/if}
    </div>
    <Button onclick={() => (value = generateSecret())}>Generate</Button>
  </div>

  <div class="flex items-center gap-2.5">
    <div class="flex h-1 flex-1 gap-1">
      {#each [1, 2, 3, 4] as step (step)}
        <div class="h-full flex-1 rounded-full {score >= step ? barTone : 'bg-fill-deep'}"></div>
      {/each}
    </div>
    <span class="mono w-14 text-right text-nano text-ink-soft">{value.length} ch</span>
  </div>

  {#if shown}
    <div class="text-nano font-medium text-danger-ink">{shown}</div>
  {:else if value && !problem}
    <div class="flex items-center gap-1.5 text-nano font-medium text-ok">
      <Icon name="check" size={11} stroke={3} /> Strong enough — copy it before you save
    </div>
  {/if}
</div>
