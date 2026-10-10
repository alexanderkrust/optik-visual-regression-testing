<script lang="ts">
  import { useI18n } from '$lib/i18n';
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
  const { m, f } = useI18n();

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

<svelte:head><title>{m.common.title(m.nav.projects)}</title></svelte:head>

<div class="flex items-center justify-between mb-8">
  <div>
    <h1 class="text-2xl font-bold tracking-tight">{m.nav.projects}</h1>
    <p class="text-muted-foreground text-sm mt-1">
      {m.projects.count(data.projects.length)}
    </p>
  </div>
  {#if data.user.role === 'admin'}
  <Dialog bind:open={dialogOpen}>
    <DialogTrigger>
      {#snippet child({ props })}
        <Button {...props}>
          <Plus class="h-4 w-4" />
          {m.projects.newProject}
        </Button>
      {/snippet}
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{m.projects.createTitle}</DialogTitle>
        <DialogDescription>{m.projects.createDescription}</DialogDescription>
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
          <Label for="name">{m.common.name}</Label>
          <Input
            id="name"
            name="name"
            bind:value={name}
            oninput={onNameInput}
            placeholder={m.projects.namePlaceholder}
            required
          />
        </div>
        <div class="space-y-2">
          <Label for="slug">{m.projects.slug}</Label>
          <Input
            id="slug"
            name="slug"
            bind:value={slug}
            placeholder="my-app"
            required
          />
          <p class="text-muted-foreground text-xs">{m.projects.slugHint}</p>
        </div>
        <DialogFooter>
          <DialogClose>
            {#snippet child({ props })}
              <Button type="button" variant="outline" {...props}>{m.common.cancel}</Button>
            {/snippet}
          </DialogClose>
          <Button type="submit" disabled={creating}>
            {creating ? m.projects.creating : m.projects.create}
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
      <h3 class="font-semibold text-lg">{m.projects.empty}</h3>
      <p class="text-muted-foreground text-sm mt-1 mb-6">{m.projects.emptyHint}</p>
      <Button onclick={() => (dialogOpen = true)}>
        <Plus class="h-4 w-4" />
        {m.projects.newProject}
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
              {m.projects.created(f.date(project.createdAt))}
              {#if data.storage.find((s) => s.projectId === project.id)}
                {@const usage = data.storage.find((s) => s.projectId === project.id)!}
                · {m.projects.usage(f.bytes(usage.bytes), usage.images)}
              {/if}
            </p>
          </CardContent>
        </Card>
      </a>
    {/each}
  </div>
{/if}
