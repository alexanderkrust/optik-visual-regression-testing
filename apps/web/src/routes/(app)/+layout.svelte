<script lang="ts">
  import '../../app.css';
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { LayoutDashboard, FolderOpen, LogOut, Users } from 'lucide-svelte';
  import type { LayoutData } from './$types';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  const navItems = $derived([
    { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    { label: 'Projects', href: '/projects', icon: FolderOpen },
    ...(data.user.role === 'admin' ? [{ label: 'Users', href: '/users', icon: Users }] : []),
  ]);

  function isActive(href: string): boolean {
    const pathname = page.url.pathname;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  }
</script>

<div class="flex min-h-screen bg-background">
  <aside class="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-background">
    <div class="flex h-14 items-center border-b px-5">
      <a href="/" class="flex items-center gap-2.5 font-semibold">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-5 w-5"
        >
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
          <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
          <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" />
          <line x1="4.93" y1="19.07" x2="9.17" y2="14.83" />
        </svg>
        <span>optik</span>
      </a>
    </div>
    <nav class="flex flex-1 flex-col gap-1 p-3">
      {#each navItems as item}
        {@const active = isActive(item.href)}
        <a
          href={item.href}
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors {active
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
        >
          <item.icon class="h-4 w-4 shrink-0" />
          {item.label}
        </a>
      {/each}

      <div class="mt-auto">
        {#if data.user}
          <div class="flex items-center justify-between rounded-md px-3 py-2">
            <span class="truncate text-xs text-muted-foreground">{data.user.email}</span>
            <form method="POST" action="/logout">
              <button
                type="submit"
                title="Sign out"
                class="ml-2 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut class="h-4 w-4" />
              </button>
            </form>
          </div>
        {/if}
      </div>
    </nav>
  </aside>
  <main class="flex-1 min-w-0 pl-60">
    <div class="px-8 py-8">
      {@render children()}
    </div>
  </main>
</div>
