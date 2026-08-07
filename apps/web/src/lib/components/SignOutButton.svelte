<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import Button from './Button.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';

  let confirming = $state(false);
</script>

<Button onclick={() => (confirming = true)}>Sign out</Button>

<ConfirmDialog
  bind:open={confirming}
  title="Sign out?"
  description="You'll need your username and password to get back into the dashboard."
  confirmLabel="Sign out"
  cancelLabel="Stay"
  onconfirm={() => auth.logout()}
/>
