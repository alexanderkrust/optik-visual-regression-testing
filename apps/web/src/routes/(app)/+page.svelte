<script lang="ts">
  import { FolderOpen, CalendarDays, Layers, ArrowRight } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '$lib/components/ui/card';
  import { useI18n } from '$lib/i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const { m, f } = useI18n();

  const recentProjects = $derived(data.projects.slice(0, 6));
</script>

<svelte:head><title>{m.common.title(m.nav.dashboard)}</title></svelte:head>

<div class="mb-8">
  <h1 class="text-2xl font-bold tracking-tight">{m.nav.dashboard}</h1>
  <p class="text-muted-foreground text-sm mt-1">{m.dashboard.subtitle}</p>
</div>

<div class="grid gap-4 sm:grid-cols-3 mb-8">
  <Card>
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle level={2} class="text-sm font-medium">{m.dashboard.totalProjects}</CardTitle>
      <FolderOpen class="text-muted-foreground h-4 w-4" />
    </CardHeader>
    <CardContent>
      <div class="text-2xl font-bold">{data.projects.length}</div>
      <p class="text-muted-foreground text-xs mt-1">{m.dashboard.activeProjects}</p>
    </CardContent>
  </Card>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle level={2} class="text-sm font-medium">{m.dashboard.environments}</CardTitle>
      <Layers class="text-muted-foreground h-4 w-4" />
    </CardHeader>
    <CardContent>
      <div class="text-2xl font-bold">{data.projects.length}</div>
      <p class="text-muted-foreground text-xs mt-1">{m.dashboard.acrossProjects}</p>
    </CardContent>
  </Card>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle level={2} class="text-sm font-medium">{m.dashboard.lastCreated}</CardTitle>
      <CalendarDays class="text-muted-foreground h-4 w-4" />
    </CardHeader>
    <CardContent>
      {#if data.projects.length > 0}
        <div class="text-2xl font-bold">
          {f.date(data.projects[0].createdAt)}
        </div>
        <p class="text-muted-foreground text-xs mt-1">{data.projects[0].name}</p>
      {:else}
        <div class="text-2xl font-bold">—</div>
        <p class="text-muted-foreground text-xs mt-1">{m.dashboard.noProjects}</p>
      {/if}
    </CardContent>
  </Card>
</div>

<div class="flex items-center justify-between mb-4">
  <h2 class="text-lg font-semibold">{m.dashboard.recentProjects}</h2>
  <Button variant="ghost" size="sm" href="/projects" class="gap-1 text-muted-foreground">
    {m.dashboard.viewAll}
    <ArrowRight class="h-3.5 w-3.5" />
  </Button>
</div>

{#if recentProjects.length === 0}
  <Card>
    <CardContent class="flex flex-col items-center justify-center py-12 text-center">
      <FolderOpen class="text-muted-foreground mb-3 h-10 w-10" />
      <h3 class="font-semibold">{m.dashboard.noProjects}</h3>
      <p class="text-muted-foreground text-sm mt-1 mb-4">{m.dashboard.noProjectsHint}</p>
      <Button href="/projects" variant="outline" size="sm">{m.dashboard.goToProjects}</Button>
    </CardContent>
  </Card>
{:else}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each recentProjects as project (project.id)}
      <a href="/{project.slug}" class="group block">
        <Card class="h-full transition-colors group-hover:border-primary/50 group-hover:shadow-sm">
          <CardHeader class="pb-3">
            <CardTitle class="text-base">{project.name}</CardTitle>
            <CardDescription class="font-mono text-xs">{project.slug}</CardDescription>
          </CardHeader>
          <CardContent>
            <p class="text-muted-foreground text-xs">
              {m.projects.created(f.date(project.createdAt))}
            </p>
          </CardContent>
        </Card>
      </a>
    {/each}
  </div>
{/if}
