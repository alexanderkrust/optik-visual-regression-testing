<script lang="ts">
  import { enhance } from '$app/forms';
  import { KeyRound, TriangleAlert, CircleAlert } from 'lucide-svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Label } from '$lib/components/ui/label';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const info = $derived(data.info);
  const license = $derived(info.license);
  const EDITIONS = { community: 'Community', team: 'Team', enterprise: 'Enterprise' } as const;
  const usage = $derived(Math.min(100, Math.round((info.reviewers / info.maxReviewers) * 100)));
  const date = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
</script>

<svelte:head><title>License — optik</title></svelte:head>

<div class="mb-6">
  <h1 class="text-2xl font-bold tracking-tight">License</h1>
  <p class="text-muted-foreground text-sm mt-1">
    Keys are checked offline — optik never contacts a license server. Nothing is ever locked: problems
    only show here and as a notice for admins.
  </p>
</div>

<Card class="mb-6">
  <CardContent class="p-6 space-y-5">
    <div class="flex items-center gap-3">
      <KeyRound class="h-5 w-5 text-muted-foreground" />
      <span class="text-lg font-semibold">{EDITIONS[info.edition]} edition</span>
      {#if info.source === 'environment'}<Badge variant="outline">from OPTIK_LICENSE</Badge>{/if}
    </div>

    {#each info.problems as problem (problem)}
      <p class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" />{problem}
      </p>
    {/each}
    {#each info.warnings as warning (warning)}
      <p class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />{warning}
      </p>
    {/each}

    <div>
      <div class="flex justify-between text-sm mb-1.5">
        <span>Reviewers <span class="text-muted-foreground">(admins, maintainers and reviewers)</span></span>
        <span class="font-medium">{info.reviewers} of {info.maxReviewers}</span>
      </div>
      <div class="h-2 rounded-full bg-muted overflow-hidden">
        <div
          class="h-full rounded-full {info.reviewers > info.maxReviewers ? 'bg-amber-500' : 'bg-primary'}"
          style="width: {usage}%"
        ></div>
      </div>
    </div>

    {#if license}
      <dl class="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-sm">
        <dt class="text-muted-foreground">Licensee</dt><dd>{license.licensee}</dd>
        <dt class="text-muted-foreground">Licensed edition</dt><dd>{EDITIONS[license.edition]}, {license.maxReviewers} reviewers</dd>
        <dt class="text-muted-foreground">Updates until</dt>
        <dd>{date(license.updatesUntil)} <span class="text-muted-foreground">— releases up to this day; optik keeps working afterwards</span></dd>
        {#if license.validUntil}<dt class="text-muted-foreground">Trial ends</dt><dd>{date(license.validUntil)}</dd>{/if}
        <dt class="text-muted-foreground">License ID</dt><dd class="font-mono text-xs">{license.id}</dd>
      </dl>
    {:else}
      <p class="text-sm text-muted-foreground">
        Without a license key optik runs as Community edition with up to {info.maxReviewers} reviewers and
        all core features.
      </p>
    {/if}
    <p class="text-xs text-muted-foreground">
      This release: {info.releaseDate ? date(info.releaseDate) : 'development build'}
    </p>
  </CardContent>
</Card>

{#if info.source !== 'environment'}
  <Card>
    <CardContent class="p-6 space-y-3">
      <form method="POST" action="?/install" use:enhance class="space-y-3">
        <Label for="license-key">{license ? 'Replace the license key' : 'Enter a license key'}</Label>
        <textarea
          id="license-key"
          name="key"
          rows="4"
          spellcheck="false"
          placeholder="optik1.…"
          class="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        ></textarea>
        <div class="flex gap-2">
          <Button type="submit" size="sm">Install</Button>
          {#if info.source === 'settings'}
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              formaction="?/remove"
              onclick={(e: MouseEvent) => {
                if (!confirm('Remove the license key? optik switches to the Community edition.')) e.preventDefault();
              }}>Remove license</Button
            >
          {/if}
        </div>
      </form>
      {#if form && 'error' in form}<p class="text-sm text-destructive">{form.error}</p>{/if}
      {#if form && 'installed' in form}<p class="text-sm text-green-700">License installed.</p>{/if}
      <p class="text-xs text-muted-foreground">
        Automated installs: set <code>OPTIK_LICENSE</code> (or <code>OPTIK_LICENSE_FILE</code>) instead.
      </p>
    </CardContent>
  </Card>
{/if}
