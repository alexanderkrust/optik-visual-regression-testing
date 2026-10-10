<script lang="ts">
  import { enhance } from '$app/forms';
  import { useI18n } from '$lib/i18n';
  import LanguageSwitch from '$lib/components/language-switch.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const { m } = useI18n();
</script>

<svelte:head>
  <title>{m.common.title(m.auth.signIn)}</title>
</svelte:head>

<LanguageSwitch class="fixed right-4 top-4" />

<div class="flex min-h-screen items-center justify-center bg-background">
  <div class="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
    <div class="space-y-1 text-center">
      <h1 class="text-2xl font-semibold tracking-tight">{m.auth.signInTitle}</h1>
      <p class="text-sm text-muted-foreground">{m.auth.signInSubtitle}</p>
    </div>

    {#if data.ssoProviders.length > 0}
      <div class="space-y-2">
        {#each data.ssoProviders as provider (provider.id)}
          <a
            href="/api/auth/sso/{provider.id}/start?returnTo=/"
            class="inline-flex h-9 w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {m.auth.signInWith(provider.name)}
          </a>
        {/each}
      </div>
      <div class="flex items-center gap-3 text-xs text-muted-foreground">
        <span class="h-px flex-1 bg-border"></span>{m.auth.orPassword}<span class="h-px flex-1 bg-border"></span>
      </div>
    {/if}

    {#if data.ssoError}
      <div class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {m.auth.ssoFailed(data.ssoError)}
      </div>
    {/if}

    {#if form?.error}
      <div class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {form.error}
      </div>
    {/if}

    <form method="POST" use:enhance class="space-y-4">
      <div class="space-y-1">
        <label for="email" class="text-sm font-medium leading-none">{m.common.email}</label>
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="email"
          required
          value={form?.email ?? ''}
          class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="admin@example.com"
        />
      </div>

      <div class="space-y-1">
        <label for="password" class="text-sm font-medium leading-none">{m.common.password}</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <button
        type="submit"
        class="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {m.auth.signIn}
      </button>
    </form>
  </div>
</div>
