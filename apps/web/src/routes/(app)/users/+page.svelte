<script lang="ts">
  import { enhance } from '$app/forms';
  import { Check, Copy, Trash2, UserPlus } from 'lucide-svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '$lib/components/ui/table';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let inviteProject = $state('');
  let copied = $state(false);

  const selectClass =
    'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<svelte:head><title>Users — optik</title></svelte:head>

<div class="mb-6">
  <h1 class="text-2xl font-bold tracking-tight">Users</h1>
  <p class="text-muted-foreground text-sm mt-1">
    Admins manage users and see every project. Members see the projects they are added to.
  </p>
</div>

<Card class="mb-6">
  <CardContent class="p-6">
    <h2 class="font-semibold mb-4 flex items-center gap-2"><UserPlus class="h-4 w-4" /> Invite someone</h2>
    <form method="POST" action="?/invite" use:enhance class="flex flex-wrap items-end gap-3">
      <div class="flex flex-col gap-1.5 flex-1 min-w-56">
        <Label for="invite-email">Email</Label>
        <Input id="invite-email" name="email" type="email" required value={form?.email ?? ''} placeholder="jane@example.com" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="invite-role">Role</Label>
        <select id="invite-role" name="role" class={selectClass}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="invite-project">Project <span class="font-normal text-muted-foreground">(optional)</span></Label>
        <select id="invite-project" name="projectSlug" class={selectClass} bind:value={inviteProject}>
          <option value="">—</option>
          {#each data.projects as project}
            <option value={project.slug}>{project.name}</option>
          {/each}
        </select>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="invite-project-role">Project role</Label>
        <select id="invite-project-role" name="projectRole" class={selectClass} disabled={!inviteProject}>
          <option value="viewer">Viewer</option>
          <option value="reviewer">Reviewer</option>
          <option value="maintainer">Maintainer</option>
        </select>
      </div>
      <Button type="submit">Create invitation</Button>
    </form>

    {#if form && 'inviteError' in form}
      <p class="mt-3 text-sm text-destructive">{form.inviteError}</p>
    {/if}
    {#if form && 'inviteLink' in form}
      <div class="mt-4 rounded-md border bg-muted/50 p-3 space-y-2">
        <p class="text-sm">
          {#if form.emailSent}
            Invitation e-mail sent to <strong>{form.invitedEmail}</strong>. You can also share the link
            yourself — it is valid for 7 days and shown only once.
          {:else}
            Send this link to <strong>{form.invitedEmail}</strong>. It is valid for 7 days and shown only once.
          {/if}
        </p>
        <div class="flex items-center gap-2">
          <code class="flex-1 truncate rounded bg-background px-2 py-1 text-xs font-mono select-all">{form.inviteLink}</code>
          <Button variant="outline" size="sm" onclick={() => copy(form.inviteLink ?? '')}>
            {#if copied}<Check class="h-4 w-4" /> Copied{:else}<Copy class="h-4 w-4" /> Copy{/if}
          </Button>
        </div>
      </div>
    {/if}
  </CardContent>
</Card>

{#if form && 'userError' in form}
  <p class="mb-3 text-sm text-destructive">{form.userError}</p>
{/if}

<Card class="mb-6">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Email</TableHead>
        <TableHead>Role</TableHead>
        <TableHead>Since</TableHead>
        <TableHead class="w-40"><span class="sr-only">Actions</span></TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {#each data.users as user (user.id)}
        {@const self = user.id === data.user.id}
        <TableRow>
          <TableCell class="font-medium">
            <span class={user.active ? '' : 'text-muted-foreground line-through'}>{user.email}</span>
            {#if self}<Badge variant="outline" class="ml-2 text-xs">you</Badge>{/if}
            {#if !user.active}<Badge variant="secondary" class="ml-2 text-xs">deactivated</Badge>{/if}
          </TableCell>
          <TableCell>
            <form method="POST" action="?/setRole" use:enhance>
              <input type="hidden" name="id" value={user.id} />
              <select
                name="role"
                aria-label="Instance role of {user.email}"
                class={selectClass}
                value={user.role}
                onchange={(e) => e.currentTarget.form?.requestSubmit()}
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
            </form>
          </TableCell>
          <TableCell class="text-sm text-muted-foreground">{date(user.createdAt)}</TableCell>
          <TableCell>
            {#if !self}
              <div class="flex items-center justify-end gap-1">
              <form method="POST" action="?/setActive" use:enhance>
                <input type="hidden" name="id" value={user.id} />
                <input type="hidden" name="active" value={user.active ? 'false' : 'true'} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  title={user.active ? 'Sign-in and API access end at once; reviews and comments stay' : ''}
                >
                  {user.active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </form>
              <form method="POST" action="?/removeUser" use:enhance>
                <input type="hidden" name="id" value={user.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove {user.email}"
                  onclick={(e: MouseEvent) => {
                    if (!confirm(`Remove ${user.email}? Their reviews stay, without a name.`)) e.preventDefault();
                  }}
                >
                  <Trash2 class="h-4 w-4 text-muted-foreground" />
                </Button>
              </form>
              </div>
            {/if}
          </TableCell>
        </TableRow>
      {/each}
    </TableBody>
  </Table>
</Card>

{#if data.invitations.length > 0}
  <h2 class="font-semibold mb-3">Pending invitations</h2>
  <Card>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead class="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {#each data.invitations as invitation (invitation.id)}
          <TableRow>
            <TableCell>{invitation.email}</TableCell>
            <TableCell class="text-sm">{invitation.role}</TableCell>
            <TableCell class="text-sm">
              {#if invitation.projectSlug}{invitation.projectSlug} ({invitation.projectRole}){:else}—{/if}
            </TableCell>
            <TableCell class="text-sm text-muted-foreground">{date(invitation.expiresAt)}</TableCell>
            <TableCell>
              <form method="POST" action="?/revokeInvitation" use:enhance>
                <input type="hidden" name="id" value={invitation.id} />
                <Button type="submit" variant="ghost" size="sm" aria-label="Revoke invitation for {invitation.email}">
                  <Trash2 class="h-4 w-4 text-muted-foreground" />
                </Button>
              </form>
            </TableCell>
          </TableRow>
        {/each}
      </TableBody>
    </Table>
  </Card>
{/if}
