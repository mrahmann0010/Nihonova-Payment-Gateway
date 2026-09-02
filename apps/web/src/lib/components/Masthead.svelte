<script lang="ts">
  import { page } from '$app/state';
  import AlertBell from './AlertBell.svelte';
  import Logo from './Logo.svelte';

  const tabs = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/transactions', label: 'Transactions' },
    { href: '/reports', label: 'Reports' },
    { href: '/health', label: 'Health' }
  ];
</script>

<div class="flex items-center justify-between gap-4">
  <div class="flex flex-none items-center gap-2.5">
    <Logo size={26} />
    <span class="text-label font-semibold text-ink-mid">Nihonova Academy</span>
  </div>

  <div class="flex min-w-0 items-center gap-2.5">
    <!-- Tabs are the only flexible part of the bar: they scroll rather than
         push the bell off a narrow screen. -->
    <nav
      class="flex min-w-0 gap-0.75 overflow-x-auto rounded-[11px] bg-fill p-0.75
        [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {#each tabs as t}
        <a
          href={t.href}
          class="rounded-lg px-3.75 py-2 text-ident whitespace-nowrap {page.url.pathname === t.href
            ? 'bg-panel font-semibold text-ink shadow-card'
            : 'font-medium text-ink-mid hover:text-ink'}">{t.label}</a
        >
      {/each}
    </nav>
    <AlertBell />
  </div>
</div>
