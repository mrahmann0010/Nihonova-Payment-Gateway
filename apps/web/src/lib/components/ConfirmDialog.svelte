<script lang="ts">
  import Button from './Button.svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import Modal from './Modal.svelte';

  let {
    open = $bindable(false),
    title,
    description,
    icon = 'sign-out',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = true,
    onconfirm
  }: {
    open?: boolean;
    title: string;
    description: string;
    icon?: IconName;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onconfirm: () => void;
  } = $props();
</script>

<Modal bind:open width="sm">
  <div class="mb-3.5 grid size-9.5 place-items-center rounded-[11px] bg-fill text-ink-deep">
    <Icon name={icon} size={19} stroke={2.1} />
  </div>
  <div class="mb-1.5 text-lede font-bold">{title}</div>
  <p class="text-ctl leading-normal text-ink-mid">{description}</p>
  <div class="mt-5.5 flex gap-2.5">
    <Button full onclick={() => (open = false)}>{cancelLabel}</Button>
    <Button
      full
      variant={destructive ? 'danger' : 'primary'}
      onclick={() => {
        open = false;
        onconfirm();
      }}>{confirmLabel}</Button
    >
  </div>
</Modal>
