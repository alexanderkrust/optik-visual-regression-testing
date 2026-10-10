<!--
  Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
  the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Plus, X } from 'lucide-svelte';
  import type { IdentityProvider, IdpProtocol, Project, SsoRoleMapping, Team } from '@optik/shared';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { useI18n } from '$lib/i18n';

  let {
    provider = null,
    projects,
    teams = [],
    error = null,
    oncancel,
  }: {
    provider?: IdentityProvider | null;
    projects: Project[];
    teams?: Team[];
    error?: string | null;
    oncancel?: () => void;
  } = $props();
  const { m } = useI18n();
  const t = m.sso.form;

  // The form edits a copy of the provider as it was when the form opened
  const initial = untrack(() => provider);
  const prefix = initial?.id ?? 'new';
  let protocol = $state<IdpProtocol>(initial?.protocol ?? 'oidc');
  /** A mapping's target as one select value: "" (optik admin), "project:<slug>" or "team:<name>" */
  type Row = { group: string; target: string; role: SsoRoleMapping['role'] };
  const targetOf = (m: SsoRoleMapping) => (m.team ? `team:${m.team}` : m.project ? `project:${m.project}` : '');
  let mappings = $state<Row[]>(
    initial?.roleMappings.map((m) => ({ group: m.group, target: targetOf(m), role: m.role })) ?? [],
  );
  const selectClass =
    'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
</script>

<form method="POST" action="?/save" use:enhance class="space-y-4">
  <input type="hidden" name="id" value={provider?.id ?? ''} />
  {#if !initial}
    <div class="flex gap-6 text-sm" role="radiogroup" aria-label={t.protocol}>
      <label class="flex items-center gap-2"><input type="radio" bind:group={protocol} value="oidc" /> OpenID Connect</label>
      <label class="flex items-center gap-2"><input type="radio" bind:group={protocol} value="saml" /> SAML 2.0</label>
    </div>
  {/if}
  <input type="hidden" name="protocol" value={protocol} />
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="space-y-1.5">
      <Label for="{prefix}-name">{t.buttonName}</Label>
      <Input id="{prefix}-name" name="name" required value={provider?.name ?? ''} placeholder="Acme ID" />
    </div>
    {#if protocol === 'oidc'}
      <div class="space-y-1.5">
        <Label for="{prefix}-issuer">{t.issuerUrl}</Label>
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
        <Label for="{prefix}-client-id">{t.clientId}</Label>
        <Input id="{prefix}-client-id" name="clientId" required class="font-mono" value={provider?.clientId ?? ''} />
      </div>
      <div class="space-y-1.5">
        <Label for="{prefix}-client-secret">{t.clientSecret}</Label>
        <Input
          id="{prefix}-client-secret"
          name="clientSecret"
          type="password"
          autocomplete="off"
          placeholder={provider?.clientSecretConfigured ? t.secretStored : t.secretFrom}
        />
      </div>
      <div class="space-y-1.5">
        <Label for="{prefix}-scopes">{t.scopes}</Label>
        <Input id="{prefix}-scopes" name="scopes" class="font-mono" value={provider?.scopes ?? 'openid email profile'} />
      </div>
    {:else}
      <div class="space-y-1.5">
        <Label for="{prefix}-issuer">{t.entityId}</Label>
        <Input
          id="{prefix}-issuer"
          name="issuer"
          required
          class="font-mono"
          value={provider?.issuer ?? ''}
          placeholder="https://sts.windows.net/<tenant>/"
        />
      </div>
      <div class="space-y-1.5 sm:col-span-2">
        <Label for="{prefix}-entry-point">{t.signInUrl} <span class="font-normal text-muted-foreground">{t.signInUrlHint}</span></Label>
        <Input
          id="{prefix}-entry-point"
          name="samlEntryPoint"
          required
          class="font-mono"
          value={provider?.samlEntryPoint ?? ''}
          placeholder="https://login.microsoftonline.com/<tenant>/saml2"
        />
      </div>
      <div class="space-y-1.5 sm:col-span-2">
        <Label for="{prefix}-certificate">{t.certificate} <span class="font-normal text-muted-foreground">{t.certificateHint}</span></Label>
        <textarea
          id="{prefix}-certificate"
          name="samlCertificate"
          required
          rows="4"
          spellcheck="false"
          class="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="-----BEGIN CERTIFICATE-----">{provider?.samlCertificate ?? ''}</textarea>
      </div>
      <div class="space-y-1.5">
        <Label for="{prefix}-email-attribute">{t.emailAttribute} <span class="font-normal text-muted-foreground">{t.emailAttributeHint}</span></Label>
        <Input id="{prefix}-email-attribute" name="emailAttribute" class="font-mono" value={provider?.emailAttribute ?? 'email'} />
      </div>
    {/if}
    <div class="space-y-1.5">
      <Label for="{prefix}-groups-claim">{protocol === 'saml' ? t.groupsAttribute : t.groupsClaim}</Label>
      <Input id="{prefix}-groups-claim" name="groupsClaim" class="font-mono" value={provider?.groupsClaim ?? 'groups'} />
    </div>
    <div class="space-y-1.5 sm:col-span-2">
      <Label for="{prefix}-domains">{t.domains} <span class="font-normal text-muted-foreground">{t.domainsHint}</span></Label>
      <Input id="{prefix}-domains" name="allowedDomains" value={provider?.allowedDomains.join(', ') ?? ''} placeholder="acme.com, acme.de" />
    </div>
  </div>

  <div class="space-y-2">
    <p class="text-sm font-medium">{t.rolesFromGroups}</p>
    <p class="text-xs text-muted-foreground">
      {t.rolesHint}
    </p>
    {#each mappings as mapping, i (i)}
      <div class="flex flex-wrap items-center gap-2">
        <Input name="mappingGroup" bind:value={mapping.group} placeholder={t.groupPlaceholder} class="h-9 w-64 font-mono" aria-label={t.group} />
        <span class="text-sm text-muted-foreground">→</span>
        <select name="mappingTarget" class={selectClass} bind:value={mapping.target} aria-label={t.where}>
          <option value="">{t.optikAdmin}</option>
          <optgroup label={t.projects}>
            {#each projects as project (project.id)}<option value="project:{project.slug}">{project.name}</option>{/each}
          </optgroup>
          {#if teams.length > 0}
            <optgroup label={t.teams}>
              {#each teams as team (team.id)}<option value="team:{team.name}">{t.team(team.name)}</option>{/each}
            </optgroup>
          {/if}
        </select>
        {#if mapping.target.startsWith('project:')}
          <select name="mappingRole" class={selectClass} bind:value={mapping.role} aria-label={t.projectRole}>
            <option value="viewer">{m.roles.viewer}</option>
            <option value="reviewer">{m.roles.reviewer}</option>
            <option value="maintainer">{m.roles.maintainer}</option>
          </select>
        {:else}
          <input type="hidden" name="mappingRole" value={mapping.target ? 'member' : 'admin'} />
        {/if}
        <Button type="button" variant="ghost" size="sm" onclick={() => (mappings = mappings.filter((_, j) => j !== i))} aria-label={t.removeMapping}>
          <X class="h-4 w-4" />
        </Button>
      </div>
    {/each}
    <Button
      type="button"
      variant="outline"
      size="sm"
      onclick={() =>
        (mappings = [...mappings, { group: '', target: projects[0] ? `project:${projects[0].slug}` : '', role: 'reviewer' }])}
    >
      <Plus class="h-4 w-4" /> {t.addMapping}
    </Button>
  </div>

  <div class="flex flex-wrap gap-6 text-sm">
    <label class="flex items-center gap-2">
      <input type="checkbox" name="createUsers" checked={provider?.createUsers ?? true} />
      {t.createUsers}
    </label>
    <label class="flex items-center gap-2">
      <input type="checkbox" name="enabled" checked={provider?.enabled ?? true} />
      {t.enabled}
    </label>
  </div>

  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
  <div class="flex gap-2">
    <Button type="submit" size="sm">{provider ? m.common.save : t.addProvider}</Button>
    {#if oncancel}<Button type="button" variant="ghost" size="sm" onclick={oncancel}>{m.common.cancel}</Button>{/if}
  </div>
</form>
