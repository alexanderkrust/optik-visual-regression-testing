<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
  <title>Login — optik</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-background">
  <div class="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
    <div class="space-y-1 text-center">
      <h1 class="text-2xl font-semibold tracking-tight">Sign in to optik</h1>
      <p class="text-sm text-muted-foreground">Enter your credentials to continue</p>
    </div>

    {#if form?.error}
      <div class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {form.error}
      </div>
    {/if}

    <form method="POST" use:enhance class="space-y-4">
      <div class="space-y-1">
        <label for="email" class="text-sm font-medium leading-none">Email</label>
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
        <label for="password" class="text-sm font-medium leading-none">Password</label>
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
        Sign in
      </button>
    </form>
  </div>
</div>
