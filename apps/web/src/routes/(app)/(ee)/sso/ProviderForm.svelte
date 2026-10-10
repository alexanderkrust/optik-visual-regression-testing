<!--
  Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
  the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Plus, X } from 'lucide-svelte';
  import type { IdentityProvider, Project, SsoRoleMapping } from '@optik/shared';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

  let {
    provider = null,
    projects,
    error = null,
    oncancel,
  }: {
    provider?: IdentityProvider | null;
    projects: Project[];
    error?: string | null;
    oncancel?: () => void;
  } = $props();

  // The form edits a copy of the provider as it was when the form opened
  const initial = untrack(() => provider);
  const prefix = initial?.id ?? 'new';
  let mappings = $state<SsoRoleMapping[]>(initial?.roleMappings.map((m) => ({ ...m })) ?? []);
  const selectClass =
    'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
</script>

<form method="POST" action="?/save" use:enhance class="space-y-4">
  <input type="hidden" name="id" value={provider?.id ?? ''} />
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="space-y-1.5">
      <Label for="{prefix}-name">Name on the sign-in button</Label>
      <Input id="{prefix}-name" name="name" required value={provider?.name ?? ''} placeholder="Acme ID" />
    </div>
    <div class="space-y-1.5">
      <Label for="{prefix}-issuer">Issuer URL</Label>
      <Input
        id="{prefix}-issuer"
        name="issuer"
        required
        class="font-mono"
        value={provider?.issuer ?? ''}
        placeholder="https://login.microsoftonline.com/<tenant>/v2.0"
      />
    </div>
    <div class="space-y-1.5">
      <Label for="{prefix}-client-id">Client ID</Label>
      <Input id="{prefix}-client-id" name="clientId" required class="font-mono" value={provider?.clientId ?? ''} />
    </div>
    <div class="space-y-1.5">
      <Label for="{prefix}-client-secret">Client secret</Label>
      <Input
        id="{prefix}-client-secret"
        name="clientSecret"
        type="password"
        autocomplete="off"
        placeholder={provider?.clientSecretConfigured ? 'Stored — leave empty to keep' : 'From the app registration'}
      />
    </div>
    <div class="space-y-1.5">
      <Label for="{prefix}-scopes">Scopes</Label>
      <Input id="{prefix}-scopes" name="scopes" class="font-mono" value={provider?.scopes ?? 'openid email profile'} />
    </div>
    <div class="space-y-1.5">
      <Label for="{prefix}-groups-claim">Groups claim</Label>
      <Input id="{prefix}-groups-claim" name="groupsClaim" class="font-mono" value={provider?.groupsClaim ?? 'groups'} />
    </div>
    <div class="space-y-1.5 sm:col-span-2">
      <Label for="{prefix}-domains">Allowed e-mail domains <span class="font-normal text-muted-foreground">(empty = any)</span></Label>
      <Input id="{prefix}-domains" name="allowedDomains" value={provider?.allowedDomains.join(', ') ?? ''} placeholder="acme.com, acme.de" />
    </div>
  </div>

  <div class="space-y-2">
    <p class="text-sm font-medium">Roles from groups</p>
    <p class="text-xs text-muted-foreground">
      Roles a mapping covers follow the provider on every sign-in — the admin role if any group maps to it, and
      the role in each project named here. Everything else is managed in optik.
    </p>
    {#each mappings as mapping, i (i)}
      <div class="flex flex-wrap items-center gap-2">
        <Input name="mappingGroup" bind:value={mapping.group} placeholder="Group name or ID" class="h-9 w-64 font-mono" aria-label="Group" />
        <span class="text-sm text-muted-foreground">→</span>
        <select name="mappingProject" class={selectClass} bind:value={mapping.project} aria-label="Where">
          <option value={null}>optik admin</option>
          {#each projects as project (project.id)}<option value={project.slug}>{project.name}</option>{/each}
        </select>
        {#if mapping.project}
          <select name="mappingRole" class={selectClass} bind:value={mapping.role} aria-label="Project role">
            <option value="viewer">Viewer</option>
            <option value="reviewer">Reviewer</option>
            <option value="maintainer">Maintainer</option>
          </select>
        {:else}
          <input type="hidden" name="mappingRole" value="admin" />
        {/if}
        <Button variant="ghost" size="sm" onclick={() => (mappings = mappings.filter((_, j) => j !== i))} aria-label="Remove mapping">
          <X class="h-4 w-4" />
        </Button>
      </div>
    {/each}
    <Button
      variant="outline"
      size="sm"
      onclick={() => (mappings = [...mappings, { group: '', project: projects[0]?.slug ?? null, role: 'reviewer' }])}
    >
      <Plus class="h-4 w-4" /> Add mapping
    </Button>
  </div>

  <div class="flex flex-wrap gap-6 text-sm">
    <label class="flex items-center gap-2">
      <input type="checkbox" name="createUsers" checked={provider?.createUsers ?? true} />
      Create accounts on first sign-in
    </label>
    <label class="flex items-center gap-2">
      <input type="checkbox" name="enabled" checked={provider?.enabled ?? true} />
      Show on the sign-in page
    </label>
  </div>

  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
  <div class="flex gap-2">
    <Button type="submit" size="sm">{provider ? 'Save' : 'Add provider'}</Button>
    {#if oncancel}<Button variant="ghost" size="sm" onclick={oncancel}>Cancel</Button>{/if}
  </div>
</form>
