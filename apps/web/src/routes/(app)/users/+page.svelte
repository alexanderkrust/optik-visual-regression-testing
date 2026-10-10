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
  import { useI18n } from '$lib/i18n';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const { m, f } = useI18n();

  let inviteProject = $state('');
  let copied = $state(false);

  const selectClass =
    'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  const date = f.date;
</script>

<svelte:head><title>{m.common.title(m.nav.users)}</title></svelte:head>

<div class="mb-6">
  <h1 class="text-2xl font-bold tracking-tight">{m.nav.users}</h1>
  <p class="text-muted-foreground text-sm mt-1">{m.users.subtitle}</p>
</div>

<Card class="mb-6">
  <CardContent class="p-6">
    <h2 class="font-semibold mb-4 flex items-center gap-2"><UserPlus class="h-4 w-4" /> {m.users.invite}</h2>
    <form method="POST" action="?/invite" use:enhance class="flex flex-wrap items-end gap-3">
      <div class="flex flex-col gap-1.5 flex-1 min-w-56">
        <Label for="invite-email">{m.common.email}</Label>
        <Input id="invite-email" name="email" type="email" required value={form?.email ?? ''} placeholder="jane@example.com" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="invite-role">{m.common.role}</Label>
        <select id="invite-role" name="role" class={selectClass}>
          <option value="member">{m.roles.member}</option>
          <option value="admin">{m.roles.admin}</option>
        </select>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="invite-project">{m.common.project} <span class="font-normal text-muted-foreground">({m.common.optional})</span></Label>
        <select id="invite-project" name="projectSlug" class={selectClass} bind:value={inviteProject}>
          <option value="">—</option>
          {#each data.projects as project}
            <option value={project.slug}>{project.name}</option>
          {/each}
        </select>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="invite-project-role">{m.users.projectRole}</Label>
        <select id="invite-project-role" name="projectRole" class={selectClass} disabled={!inviteProject}>
          <option value="viewer">{m.roles.viewer}</option>
          <option value="reviewer">{m.roles.reviewer}</option>
          <option value="maintainer">{m.roles.maintainer}</option>
        </select>
      </div>
      <Button type="submit">{m.users.createInvitation}</Button>
    </form>

    {#if form && 'inviteError' in form}
      <p class="mt-3 text-sm text-destructive">{form.inviteError}</p>
    {/if}
    {#if form && 'inviteLink' in form}
      <div class="mt-4 rounded-md border bg-muted/50 p-3 space-y-2">
        <p class="text-sm">
          {#if form.emailSent}
            {m.users.invitationSent} <strong>{form.invitedEmail}</strong>. {m.users.invitationSentHint}
          {:else}
            {m.users.sendLink} <strong>{form.invitedEmail}</strong>. {m.users.sendLinkHint}
          {/if}
        </p>
        <div class="flex items-center gap-2">
          <code class="flex-1 truncate rounded bg-background px-2 py-1 text-xs font-mono select-all">{form.inviteLink}</code>
          <Button variant="outline" size="sm" onclick={() => copy(form.inviteLink ?? '')}>
            {#if copied}<Check class="h-4 w-4" /> {m.common.copied}{:else}<Copy class="h-4 w-4" /> {m.common.copy}{/if}
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
        <TableHead>{m.common.email}</TableHead>
        <TableHead>{m.common.role}</TableHead>
        <TableHead>{m.users.since}</TableHead>
        <TableHead class="w-40"><span class="sr-only">{m.common.actions}</span></TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {#each data.users as user (user.id)}
        {@const self = user.id === data.user.id}
        <TableRow>
          <TableCell class="font-medium">
            <span class={user.active ? '' : 'text-muted-foreground line-through'}>{user.email}</span>
            {#if self}<Badge variant="outline" class="ml-2 text-xs">{m.common.you}</Badge>{/if}
            {#if !user.active}<Badge variant="secondary" class="ml-2 text-xs">{m.users.deactivated}</Badge>{/if}
          </TableCell>
          <TableCell>
            <form method="POST" action="?/setRole" use:enhance>
              <input type="hidden" name="id" value={user.id} />
              <select
                name="role"
                aria-label={m.users.instanceRole(user.email)}
                class={selectClass}
                value={user.role}
                onchange={(e) => e.currentTarget.form?.requestSubmit()}
              >
                <option value="admin">{m.roles.admin}</option>
                <option value="member">{m.roles.member}</option>
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
                  title={user.active ? m.users.deactivateHint : ''}
                >
                  {user.active ? m.users.deactivate : m.users.reactivate}
                </Button>
              </form>
              <form method="POST" action="?/removeUser" use:enhance>
                <input type="hidden" name="id" value={user.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  aria-label={m.users.removeUser(user.email)}
                  onclick={(e: MouseEvent) => {
                    if (!confirm(m.users.confirmRemove(user.email))) e.preventDefault();
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
  <h2 class="font-semibold mb-3">{m.users.pendingInvitations}</h2>
  <Card>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.common.email}</TableHead>
          <TableHead>{m.common.role}</TableHead>
          <TableHead>{m.common.project}</TableHead>
          <TableHead>{m.users.expires}</TableHead>
          <TableHead class="w-12"><span class="sr-only">{m.common.actions}</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {#each data.invitations as invitation (invitation.id)}
          <TableRow>
            <TableCell>{invitation.email}</TableCell>
            <TableCell class="text-sm">{m.roles[invitation.role]}</TableCell>
            <TableCell class="text-sm">
              {#if invitation.projectSlug}{invitation.projectSlug} ({invitation.projectRole ? m.roles[invitation.projectRole] : ''}){:else}—{/if}
            </TableCell>
            <TableCell class="text-sm text-muted-foreground">{date(invitation.expiresAt)}</TableCell>
            <TableCell>
              <form method="POST" action="?/revokeInvitation" use:enhance>
                <input type="hidden" name="id" value={invitation.id} />
                <Button type="submit" variant="ghost" size="sm" aria-label={m.users.revokeInvitation(invitation.email)}>
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
