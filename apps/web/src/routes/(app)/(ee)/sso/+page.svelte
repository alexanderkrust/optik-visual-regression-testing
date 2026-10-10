<!--
  Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
  the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { Copy, LogIn, Trash2 } from 'lucide-svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent } from '$lib/components/ui/card';
  import ProviderForm from './ProviderForm.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let editing = $state<string | null>(null);
  $effect(() => {
    // Close the form once it was saved; keep it open when saving failed
    if (form && 'saved' in form) editing = null;
    else if (form && 'editing' in form) editing = form.editing as string;
  });
</script>

<svelte:head><title>Single sign-on — optik</title></svelte:head>

<div class="mb-6">
  <h1 class="text-2xl font-bold tracking-tight">Single sign-on</h1>
  <p class="text-muted-foreground text-sm mt-1">
    Sign in with your company's identity provider over OpenID Connect — Entra ID, Okta, Keycloak, Google and others.
  </p>
</div>

{#if !data.available}
  <Card>
    <CardContent class="p-8 text-center space-y-3">
      <LogIn class="mx-auto h-8 w-8 text-muted-foreground" />
      <p class="font-medium">Single sign-on is part of the optik Enterprise edition.</p>
      <p class="text-sm text-muted-foreground">
        Accounts are created on first sign-in, and roles in optik follow the groups at your identity provider.
      </p>
      <Button href="/license" variant="outline" size="sm">License</Button>
    </CardContent>
  </Card>
{:else}
  {#each data.providers as provider (provider.id)}
    <Card class="mb-4">
      <CardContent class="p-6 space-y-4">
        {#if editing === provider.id}
          <ProviderForm
            {provider}
            projects={data.projects}
            error={form && 'error' in form ? form.error : null}
            oncancel={() => (editing = null)}
          />
        {:else}
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="font-semibold flex items-center gap-2">
                {provider.name}
                {#if !provider.enabled}<Badge variant="outline">hidden</Badge>{/if}
              </p>
              <p class="text-sm text-muted-foreground font-mono truncate">{provider.issuer}</p>
              <p class="text-xs text-muted-foreground mt-1">
                {provider.roleMappings.length} role mapping{provider.roleMappings.length === 1 ? '' : 's'}
                {#if provider.allowedDomains.length}· only {provider.allowedDomains.join(', ')}{/if}
                {#if !provider.createUsers}· invited users only{/if}
              </p>
            </div>
            <div class="flex gap-2 shrink-0">
              <form method="POST" action="?/check" use:enhance>
                <input type="hidden" name="id" value={provider.id} />
                <Button type="submit" variant="outline" size="sm">Check connection</Button>
              </form>
              <Button variant="outline" size="sm" onclick={() => (editing = provider.id)}>Edit</Button>
              <form method="POST" action="?/remove" use:enhance>
                <input type="hidden" name="id" value={provider.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove {provider.name}"
                  onclick={(e: MouseEvent) => {
                    if (!confirm(`Remove ${provider.name}? Its users keep their accounts.`)) e.preventDefault();
                  }}
                >
                  <Trash2 class="h-4 w-4 text-muted-foreground" />
                </Button>
              </form>
            </div>
          </div>
          {@const check = form && 'check' in form ? form.check : null}
          {#if check && check.id === provider.id}
            <p class="text-sm {check.ok ? 'text-green-700' : 'text-destructive'}">{check.message}</p>
          {/if}
          <div class="rounded-md bg-muted/50 p-3 text-xs space-y-1">
            <p class="text-muted-foreground">Redirect URI — register it at the provider:</p>
            <div class="flex items-center gap-2">
              <code class="flex-1 truncate font-mono select-all">{provider.redirectUri}</code>
              <Button variant="ghost" size="sm" onclick={() => navigator.clipboard.writeText(provider.redirectUri)} aria-label="Copy redirect URI">
                <Copy class="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        {/if}
      </CardContent>
    </Card>
  {/each}

  <Card class="mb-6">
    <CardContent class="p-6">
      {#if editing === 'new'}
        <h2 class="font-semibold mb-4">Add an identity provider</h2>
        <ProviderForm
          projects={data.projects}
          error={form && 'error' in form ? form.error : null}
          oncancel={() => (editing = null)}
        />
      {:else}
        <Button variant="outline" size="sm" onclick={() => (editing = 'new')}>Add identity provider</Button>
        <p class="text-xs text-muted-foreground mt-3">
          The redirect URI to register appears once the provider is added. Entra ID: use the tenant's issuer
          (<code>https://login.microsoftonline.com/&lt;tenant&gt;/v2.0</code>) and add a groups claim to the token.
        </p>
      {/if}
    </CardContent>
  </Card>

  {#if data.settings}
    <Card>
      <CardContent class="p-6 space-y-3">
        <h2 class="font-semibold">Passwords</h2>
        <form method="POST" action="?/settings" use:enhance class="space-y-2 text-sm">
          <label class="flex items-start gap-2">
            <input type="radio" name="passwordLogin" value="all" checked={data.settings.passwordLogin === 'all'} class="mt-1" />
            <span>Everyone may also sign in with a password</span>
          </label>
          <label class="flex items-start gap-2">
            <input type="radio" name="passwordLogin" value="admins" checked={data.settings.passwordLogin === 'admins'} class="mt-1" />
            <span>
              Only admins — everyone else uses single sign-on
              <span class="block text-xs text-muted-foreground">Admins keep their password as a way in if the provider is down.</span>
            </span>
          </label>
          <Button type="submit" size="sm">Save</Button>
        </form>
        {#if form && 'settingsError' in form}<p class="text-sm text-destructive">{form.settingsError}</p>{/if}
        {#if form && 'settingsSaved' in form}<p class="text-sm text-green-700">Saved.</p>{/if}
      </CardContent>
    </Card>
  {/if}
{/if}
