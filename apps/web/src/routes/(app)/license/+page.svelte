<script lang="ts">
  import { enhance } from '$app/forms';
  import { KeyRound, TriangleAlert, CircleAlert } from 'lucide-svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Label } from '$lib/components/ui/label';
  import { useI18n } from '$lib/i18n';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const { m, f } = useI18n();

  const info = $derived(data.info);
  const license = $derived(info.license);
  const EDITIONS = m.license.edition;
  const usage = $derived(Math.min(100, Math.round((info.reviewers / info.maxReviewers) * 100)));
  const date = (day: string) => f.date(`${day}T12:00:00Z`);
</script>

<svelte:head><title>{m.common.title(m.nav.license)}</title></svelte:head>

<div class="mb-6">
  <h1 class="text-2xl font-bold tracking-tight">{m.nav.license}</h1>
  <p class="text-muted-foreground text-sm mt-1">{m.license.intro}</p>
</div>

<Card class="mb-6">
  <CardContent class="p-6 space-y-5">
    <div class="flex items-center gap-3">
      <KeyRound class="h-5 w-5 text-muted-foreground" />
      <span class="text-lg font-semibold">{m.license.editionTitle(EDITIONS[info.edition])}</span>
      {#if info.source === 'environment'}<Badge variant="outline">{m.license.fromEnvironment}</Badge>{/if}
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
        <span>{m.license.reviewers} <span class="text-muted-foreground">{m.license.reviewersHint}</span></span>
        <span class="font-medium">{m.license.reviewersOf(info.reviewers, info.maxReviewers)}</span>
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
        <dt class="text-muted-foreground">{m.license.licensee}</dt><dd>{license.licensee}</dd>
        <dt class="text-muted-foreground">{m.license.licensedEdition}</dt><dd>{m.license.licensedEditionValue(EDITIONS[license.edition], license.maxReviewers)}</dd>
        <dt class="text-muted-foreground">{m.license.updatesUntil}</dt>
        <dd>{date(license.updatesUntil)} <span class="text-muted-foreground">— {m.license.updatesUntilHint}</span></dd>
        {#if license.validUntil}<dt class="text-muted-foreground">{m.license.trialEnds}</dt><dd>{date(license.validUntil)}</dd>{/if}
        <dt class="text-muted-foreground">{m.license.licenseId}</dt><dd class="font-mono text-xs">{license.id}</dd>
      </dl>
    {:else}
      <p class="text-sm text-muted-foreground">{m.license.communityHint(info.maxReviewers)}</p>
    {/if}
    <p class="text-xs text-muted-foreground">
      {m.license.thisRelease} {info.releaseDate ? date(info.releaseDate) : m.license.developmentBuild}
    </p>
  </CardContent>
</Card>

{#if info.source !== 'environment'}
  <Card>
    <CardContent class="p-6 space-y-3">
      <form method="POST" action="?/install" use:enhance class="space-y-3">
        <Label for="license-key">{license ? m.license.replaceKey : m.license.enterKey}</Label>
        <textarea
          id="license-key"
          name="key"
          rows="4"
          spellcheck="false"
          placeholder="optik1.…"
          class="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        ></textarea>
        <div class="flex gap-2">
          <Button type="submit" size="sm">{m.license.install}</Button>
          {#if info.source === 'settings'}
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              formaction="?/remove"
              onclick={(e: MouseEvent) => {
                if (!confirm(m.license.confirmRemove)) e.preventDefault();
              }}>{m.license.removeLicense}</Button
            >
          {/if}
        </div>
      </form>
      {#if form && 'error' in form}<p class="text-sm text-destructive">{form.error}</p>{/if}
      {#if form && 'installed' in form}<p class="text-sm text-green-700">{m.license.installed}</p>{/if}
      <p class="text-xs text-muted-foreground">{m.license.automated}</p>
    </CardContent>
  </Card>
{/if}
