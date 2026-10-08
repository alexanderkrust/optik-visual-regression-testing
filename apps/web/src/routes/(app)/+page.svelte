<script lang="ts">
  import { FolderOpen, CalendarDays, Layers, ArrowRight } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '$lib/components/ui/card';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const recentProjects = $derived(data.projects.slice(0, 6));
</script>

<svelte:head><title>Dashboard — optik</title></svelte:head>

<div class="mb-8">
  <h1 class="text-2xl font-bold tracking-tight">Dashboard</h1>
  <p class="text-muted-foreground text-sm mt-1">Overview of your visual regression workspace</p>
</div>

<div class="grid gap-4 sm:grid-cols-3 mb-8">
  <Card>
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle class="text-sm font-medium">Total Projects</CardTitle>
      <FolderOpen class="text-muted-foreground h-4 w-4" />
    </CardHeader>
    <CardContent>
      <div class="text-2xl font-bold">{data.projects.length}</div>
      <p class="text-muted-foreground text-xs mt-1">Active visual regression projects</p>
    </CardContent>
  </Card>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle class="text-sm font-medium">Environments</CardTitle>
      <Layers class="text-muted-foreground h-4 w-4" />
    </CardHeader>
    <CardContent>
      <div class="text-2xl font-bold">{data.projects.length}</div>
      <p class="text-muted-foreground text-xs mt-1">Across all projects</p>
    </CardContent>
  </Card>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle class="text-sm font-medium">Last Created</CardTitle>
      <CalendarDays class="text-muted-foreground h-4 w-4" />
    </CardHeader>
    <CardContent>
      {#if data.projects.length > 0}
        <div class="text-2xl font-bold">
          {new Date(data.projects[0].createdAt).toLocaleDateString('de', { month: 'short', day: 'numeric' })}
        </div>
        <p class="text-muted-foreground text-xs mt-1">{data.projects[0].name}</p>
      {:else}
        <div class="text-2xl font-bold">—</div>
        <p class="text-muted-foreground text-xs mt-1">No projects yet</p>
      {/if}
    </CardContent>
  </Card>
</div>

<div class="flex items-center justify-between mb-4">
  <h2 class="text-lg font-semibold">Recent Projects</h2>
  <Button variant="ghost" size="sm" href="/projects" class="gap-1 text-muted-foreground">
    View all
    <ArrowRight class="h-3.5 w-3.5" />
  </Button>
</div>

{#if recentProjects.length === 0}
  <Card>
    <CardContent class="flex flex-col items-center justify-center py-12 text-center">
      <FolderOpen class="text-muted-foreground mb-3 h-10 w-10" />
      <h3 class="font-semibold">No projects yet</h3>
      <p class="text-muted-foreground text-sm mt-1 mb-4">
        Head over to Projects to create your first one.
      </p>
      <Button href="/projects" variant="outline" size="sm">Go to Projects</Button>
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
              Created {new Date(project.createdAt).toLocaleDateString('de', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </p>
          </CardContent>
        </Card>
      </a>
    {/each}
  </div>
{/if}
