<script lang="ts">
  import { formatBytes } from '$lib/utils';
  import { enhance } from '$app/forms';
  import { FolderOpen, Plus, AlertCircle } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '$lib/components/ui/card';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
  } from '$lib/components/ui/dialog';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let dialogOpen = $state(false);
  let name = $state('');
  let slug = $state('');
  let creating = $state(false);

  $effect(() => {
    if (form && 'error' in form) {
      name = (form as { name?: string }).name ?? name;
      slug = (form as { slug?: string }).slug ?? slug;
    }
  });

  $effect(() => {
    if (!dialogOpen) {
      name = '';
      slug = '';
    }
  });

  function slugify(value: string) {
    return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  function onNameInput(e: Event) {
    const val = (e.currentTarget as HTMLInputElement).value;
    name = val;
    if (!slug || slug === slugify(name.slice(0, -1))) {
      slug = slugify(val);
    }
  }
</script>

<svelte:head><title>Projects — optik</title></svelte:head>

<div class="flex items-center justify-between mb-8">
  <div>
    <h1 class="text-2xl font-bold tracking-tight">Projects</h1>
    <p class="text-muted-foreground text-sm mt-1">
      {data.projects.length === 1 ? '1 project' : `${data.projects.length} projects`}
    </p>
  </div>
  {#if data.user.role === 'admin'}
  <Dialog bind:open={dialogOpen}>
    <DialogTrigger>
      {#snippet child({ props })}
        <Button {...props}>
          <Plus class="h-4 w-4" />
          New Project
        </Button>
      {/snippet}
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create project</DialogTitle>
        <DialogDescription>Add a new visual regression project to your workspace.</DialogDescription>
      </DialogHeader>
      <form
        method="POST"
        action="?/create"
        use:enhance={() => {
          creating = true;
          return async ({ result, update }) => {
            creating = false;
            if (result.type === 'success') {
              dialogOpen = false;
              name = '';
              slug = '';
            }
            await update({ reset: false });
          };
        }}
        class="space-y-4"
      >
        {#if form && 'error' in form}
          <div class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
            <span>{(form as { error: string }).error}</span>
          </div>
        {/if}

        <div class="space-y-2">
          <Label for="name">Name</Label>
          <Input
            id="name"
            name="name"
            bind:value={name}
            oninput={onNameInput}
            placeholder="My App"
            required
          />
        </div>
        <div class="space-y-2">
          <Label for="slug">Slug</Label>
          <Input
            id="slug"
            name="slug"
            bind:value={slug}
            placeholder="my-app"
            required
          />
          <p class="text-muted-foreground text-xs">Used in URLs and the API. Must be unique.</p>
        </div>
        <DialogFooter>
          <DialogClose>
            {#snippet child({ props })}
              <Button type="button" variant="outline" {...props}>Cancel</Button>
            {/snippet}
          </DialogClose>
          <Button type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create project'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
  {/if}
</div>

{#if data.projects.length === 0}
  <Card>
    <CardContent class="flex flex-col items-center justify-center py-16 text-center">
      <FolderOpen class="text-muted-foreground mb-4 h-12 w-12" />
      <h3 class="font-semibold text-lg">No projects yet</h3>
      <p class="text-muted-foreground text-sm mt-1 mb-6">
        Create your first project to start tracking visual regressions.
      </p>
      <Button onclick={() => (dialogOpen = true)}>
        <Plus class="h-4 w-4" />
        New Project
      </Button>
    </CardContent>
  </Card>
{:else}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each data.projects as project (project.id)}
      <a href="/{project.slug}" class="group block">
        <Card class="h-full transition-colors group-hover:border-primary/50 group-hover:shadow-sm">
          <CardHeader class="pb-3">
            <CardTitle level={2} class="text-base">{project.name}</CardTitle>
            <CardDescription class="font-mono text-xs">{project.slug}</CardDescription>
          </CardHeader>
          <CardContent>
            <p class="text-muted-foreground text-xs">
              Created {new Date(project.createdAt).toLocaleDateString('de', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
              {#if data.storage.find((s) => s.projectId === project.id)}
                {@const usage = data.storage.find((s) => s.projectId === project.id)!}
                · {formatBytes(usage.bytes)} in {usage.images} image{usage.images === 1 ? '' : 's'}
              {/if}
            </p>
          </CardContent>
        </Card>
      </a>
    {/each}
  </div>
{/if}
