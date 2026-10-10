<script lang="ts">
  import { enhance } from '$app/forms';
  import { useI18n } from '$lib/i18n';
  import LanguageSwitch from '$lib/components/language-switch.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const { m } = useI18n();

  const inputClass =
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
</script>

<svelte:head>
  <title>{m.auth.joinTitle}</title>
</svelte:head>

<LanguageSwitch class="fixed right-4 top-4" />

<div class="flex min-h-screen items-center justify-center bg-background">
  <div class="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
    <div class="space-y-1 text-center">
      <h1 class="text-2xl font-semibold tracking-tight">{m.auth.joinTitle}</h1>
      <p class="text-sm text-muted-foreground">{m.auth.choosePassword} <strong>{data.email}</strong></p>
    </div>

    {#if form?.error}
      <div class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {form.error}
      </div>
    {/if}

    <form method="POST" use:enhance class="space-y-4">
      <div class="space-y-1">
        <label for="password" class="text-sm font-medium leading-none">{m.common.password}</label>
        <input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" class={inputClass} />
        <p class="text-xs text-muted-foreground">{m.common.atLeast8}</p>
      </div>
      <div class="space-y-1">
        <label for="confirm" class="text-sm font-medium leading-none">{m.common.confirmPassword}</label>
        <input id="confirm" name="confirm" type="password" autocomplete="new-password" required minlength="8" class={inputClass} />
      </div>
      <button
        type="submit"
        class="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {m.auth.createAccount}
      </button>
    </form>
  </div>
</div>
