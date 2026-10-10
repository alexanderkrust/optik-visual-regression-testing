<!--
  Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
  the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { Trash2, UsersRound, X } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Input } from '$lib/components/ui/input';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const selectClass =
    'h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
  const errorFor = (team: string) => (form && 'error' in form && form.team === team ? form.error : null);
</script>

<svelte:head><title>Teams — optik</title></svelte:head>

<div class="mb-6">
  <h1 class="text-2xl font-bold tracking-tight">Teams</h1>
  <p class="text-muted-foreground text-sm mt-1">
    Give a group of people a role in projects at once. A member's role in a project is the highest of their own and
    their teams'. Single sign-on can fill teams from your identity provider's groups.
  </p>
</div>

{#if !data.available}
  <Card>
    <CardContent class="p-8 text-center space-y-3">
      <UsersRound class="mx-auto h-8 w-8 text-muted-foreground" />
      <p class="font-medium">Teams are part of the optik Enterprise edition.</p>
      <p class="text-sm text-muted-foreground">Access given through existing teams keeps working without a license.</p>
      <Button href="/license" variant="outline" size="sm">License</Button>
    </CardContent>
  </Card>
{:else}
  {#each data.teams as team (team.id)}
    {@const unassigned = data.projects.filter((p) => !team.projects.some((tp) => tp.slug === p.slug))}
    <Card class="mb-4">
      <CardContent class="p-6 space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="font-semibold">{team.name}</p>
            {#if team.description}<p class="text-sm text-muted-foreground">{team.description}</p>{/if}
          </div>
          <form method="POST" action="?/remove" use:enhance>
            <input type="hidden" name="id" value={team.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              aria-label="Remove team {team.name}"
              onclick={(e: MouseEvent) => {
                if (!confirm(`Remove ${team.name}? Its members lose the access it gave them.`)) e.preventDefault();
              }}
            >
              <Trash2 class="h-4 w-4 text-muted-foreground" />
            </Button>
          </form>
        </div>

        <div class="grid gap-6 md:grid-cols-2">
          <section class="space-y-2">
            <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Members</h3>
            {#each team.members as member (member.userId)}
              <form method="POST" action="?/removeMember" use:enhance class="flex items-center justify-between text-sm">
                <input type="hidden" name="id" value={team.id} />
                <input type="hidden" name="userId" value={member.userId} />
                <span>{member.email}</span>
                <Button type="submit" variant="ghost" size="sm" aria-label="Remove {member.email} from {team.name}">
                  <X class="h-3.5 w-3.5" />
                </Button>
              </form>
            {:else}
              <p class="text-sm text-muted-foreground">No members yet.</p>
            {/each}
            <form method="POST" action="?/addMember" use:enhance class="flex gap-2">
              <input type="hidden" name="id" value={team.id} />
              <Input name="email" type="email" required placeholder="jane@example.com" class="h-8" aria-label="E-mail of the new member" />
              <Button type="submit" size="sm" variant="outline">Add</Button>
            </form>
          </section>

          <section class="space-y-2">
            <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Projects</h3>
            {#each team.projects as project (project.projectId)}
              <form method="POST" action="?/setRole" use:enhance class="flex items-center justify-between gap-2 text-sm">
                <input type="hidden" name="id" value={team.id} />
                <input type="hidden" name="project" value={project.slug} />
                <span class="truncate">{project.name}</span>
                <select
                  name="role"
                  class={selectClass}
                  value={project.role}
                  aria-label="Role of {team.name} in {project.name}"
                  onchange={(e) => e.currentTarget.form?.requestSubmit()}
                >
                  <option value="viewer">Viewer</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="maintainer">Maintainer</option>
                  <option value="">No access</option>
                </select>
              </form>
            {:else}
              <p class="text-sm text-muted-foreground">No project access yet.</p>
            {/each}
            {#if unassigned.length > 0}
              <form method="POST" action="?/setRole" use:enhance class="flex gap-2">
                <input type="hidden" name="id" value={team.id} />
                <select name="project" class={selectClass} aria-label="Project">
                  {#each unassigned as project (project.id)}<option value={project.slug}>{project.name}</option>{/each}
                </select>
                <select name="role" class={selectClass} aria-label="Role">
                  <option value="viewer">Viewer</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="maintainer">Maintainer</option>
                </select>
                <Button type="submit" size="sm" variant="outline">Give access</Button>
              </form>
            {/if}
          </section>
        </div>
        {#if errorFor(team.id)}<p class="text-sm text-destructive">{errorFor(team.id)}</p>{/if}
      </CardContent>
    </Card>
  {/each}

  <Card>
    <CardContent class="p-6">
      <h2 class="font-semibold mb-3">New team</h2>
      <form method="POST" action="?/create" use:enhance class="flex flex-wrap gap-2">
        <Input name="name" required placeholder="Frontend" class="w-56" aria-label="Team name" />
        <Input name="description" placeholder="Description (optional)" class="flex-1 min-w-56" aria-label="Description" />
        <Button type="submit" size="sm">Create team</Button>
      </form>
      {#if errorFor('new')}<p class="mt-2 text-sm text-destructive">{errorFor('new')}</p>{/if}
    </CardContent>
  </Card>
{/if}
