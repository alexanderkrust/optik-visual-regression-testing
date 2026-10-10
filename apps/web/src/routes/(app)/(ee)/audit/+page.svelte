<!--
  Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
  the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { Download, ShieldCheck, ShieldAlert, ScrollText } from 'lucide-svelte';
  import type { AuditAction, AuditEvent } from '@optik/shared';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Input } from '$lib/components/ui/input';
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

  const LABELS: Record<AuditAction, string> = {
    'auth.setup': 'Set up optik',
    'auth.login': 'Signed in',
    'auth.login_failed': 'Sign-in failed',
    'user.role_changed': 'Changed instance role',
    'user.removed': 'Removed user',
    'user.provisioned': 'Provisioned user',
    'user.updated': 'Changed user',
    'user.deactivated': 'Deactivated user',
    'user.reactivated': 'Reactivated user',
    'invitation.created': 'Invited',
    'invitation.revoked': 'Revoked invitation',
    'invitation.accepted': 'Accepted invitation',
    'project.created': 'Created project',
    'project.updated': 'Changed project settings',
    'member.added': 'Added member',
    'member.role_changed': 'Changed project role',
    'member.removed': 'Removed member',
    'token.created': 'Created API token',
    'token.revoked': 'Revoked API token',
    'snapshot.approved': 'Accepted change',
    'snapshot.rejected': 'Rejected change',
    'snapshot.settings_updated': 'Changed ignore regions / threshold',
    'comment.created': 'Commented',
    'comment.deleted': 'Deleted comment',
    'notification_channel.created': 'Added notification channel',
    'notification_channel.removed': 'Removed notification channel',
    'license.installed': 'Installed license',
    'license.removed': 'Removed license',
    'sso.provider_created': 'Added identity provider',
    'sso.provider_updated': 'Changed identity provider',
    'sso.provider_removed': 'Removed identity provider',
    'sso.settings_updated': 'Changed password sign-in',
    'team.created': 'Created team',
    'team.updated': 'Changed team',
    'team.removed': 'Removed team',
    'team.member_added': 'Added team member',
    'team.member_removed': 'Removed team member',
    'team.project_role_changed': "Changed team's project role",
    'scim.token_created': 'Created SCIM token',
    'scim.token_revoked': 'Revoked SCIM token',
  };

  const GROUPS = [
    ['', 'All events'],
    ['auth.', 'Sign-ins'],
    ['snapshot.', 'Reviews and snapshot settings'],
    ['comment.', 'Comments'],
    ['user.', 'Users'],
    ['member.', 'Project members'],
    ['invitation.', 'Invitations'],
    ['project.', 'Projects'],
    ['token.', 'API tokens'],
    ['notification_channel.', 'Notifications'],
    ['team.', 'Teams'],
    ['sso.', 'Single sign-on'],
    ['scim.', 'SCIM'],
    ['license.', 'License'],
  ] as const;

  const selectClass =
    'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
  const param = (name: string) => page.url.searchParams.get(name) ?? '';
  const filtered = $derived(['q', 'action', 'project', 'from', 'to'].some((n) => param(n)));

  /** Current filters, for export and "older events" links */
  function withParams(changes: Record<string, string | null>) {
    const params = new URLSearchParams(page.url.searchParams);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    return params.toString();
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString('en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  /** "from → to" for changes, key: value otherwise */
  function details(event: AuditEvent): string[] {
    const entries = Object.entries(event.details ?? {});
    const changes = event.details?.changes as Record<string, unknown> | undefined;
    const source = changes ? Object.entries(changes) : entries;
    return source.map(([key, value]) => {
      if (value && typeof value === 'object' && 'from' in value && 'to' in value) {
        const v = value as { from: unknown; to: unknown };
        return `${key}: ${v.from ?? '—'} → ${v.to ?? '—'}`;
      }
      return `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`;
    });
  }
</script>

<svelte:head><title>Audit log — optik</title></svelte:head>

<div class="mb-6 flex items-start justify-between gap-4">
  <div>
    <h1 class="text-2xl font-bold tracking-tight">Audit log</h1>
    <p class="text-muted-foreground text-sm mt-1">
      Who did what, when and from where. Events can't be changed or deleted.
    </p>
  </div>
  {#if data.available}
    <div class="flex gap-2">
      <form method="POST" action="?/verify" use:enhance>
        <Button type="submit" variant="outline" size="sm"><ShieldCheck class="h-4 w-4" /> Verify integrity</Button>
      </form>
      <Button variant="outline" size="sm" href="/audit/export?{withParams({ before: null, format: 'csv' })}" download>
        <Download class="h-4 w-4" /> CSV
      </Button>
      <Button variant="outline" size="sm" href="/audit/export?{withParams({ before: null, format: 'jsonl' })}" download>
        <Download class="h-4 w-4" /> JSON Lines
      </Button>
    </div>
  {/if}
</div>

{#if !data.available}
  <Card>
    <CardContent class="p-8 text-center space-y-3">
      <ScrollText class="mx-auto h-8 w-8 text-muted-foreground" />
      <p class="font-medium">The audit log is part of the optik Enterprise edition.</p>
      <p class="text-sm text-muted-foreground">
        It records reviews, permission changes, API tokens and sign-ins in an append-only, tamper-evident log
        — searchable and exportable for your security team.
      </p>
      <Button href="/license" variant="outline" size="sm">License</Button>
    </CardContent>
  </Card>
{:else}
  {#if form && 'verification' in form}
    {@const v = form.verification}
    <p
      class="mb-4 flex items-center gap-2 rounded-md border p-3 text-sm {v.valid
        ? 'border-green-300 bg-green-50 text-green-900'
        : 'border-destructive/40 bg-destructive/5 text-destructive'}"
    >
      {#if v.valid}
        <ShieldCheck class="h-4 w-4" /> All {v.checked} events are unchanged.
      {:else}
        <ShieldAlert class="h-4 w-4" /> The log was changed in the database: event #{v.firstInvalidSeq} and later
        don't match their hashes ({v.checked} events before it are intact).
      {/if}
    </p>
  {/if}

  <form method="GET" class="mb-4 flex flex-wrap items-end gap-2">
    <Input name="q" value={param('q')} placeholder="Search people, targets, IPs…" class="h-9 w-64" />
    <select name="action" class={selectClass} value={param('action')} aria-label="Event type">
      {#each GROUPS as [value, label] (value)}<option {value}>{label}</option>{/each}
    </select>
    <select name="project" class={selectClass} value={param('project')} aria-label="Project">
      <option value="">All projects</option>
      {#each data.projects as project (project.id)}<option value={project.slug}>{project.name}</option>{/each}
    </select>
    <label class="flex items-center gap-1 text-xs text-muted-foreground">
      From <Input type="date" name="from" value={param('from')} class="h-9 w-36" />
    </label>
    <label class="flex items-center gap-1 text-xs text-muted-foreground">
      To <Input type="date" name="to" value={param('to')} class="h-9 w-36" />
    </label>
    <Button type="submit" size="sm">Filter</Button>
    {#if filtered}<Button href="/audit" variant="ghost" size="sm">Reset</Button>{/if}
  </form>

  <Card>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="w-44">Time</TableHead>
          <TableHead>Who</TableHead>
          <TableHead>What</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Details</TableHead>
          <TableHead>From</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {#each data.page?.events ?? [] as event (event.seq)}
          <TableRow class="align-top">
            <TableCell class="text-xs text-muted-foreground whitespace-nowrap">{when(event.createdAt)}</TableCell>
            <TableCell class="text-sm">
              {#if event.actor.type === 'token'}
                <Badge variant="outline" class="mr-1 text-[10px]">token</Badge>
              {/if}
              {event.actor.label ?? '—'}
            </TableCell>
            <TableCell class="text-sm">
              <span class={event.action === 'auth.login_failed' ? 'text-destructive' : ''}>
                {LABELS[event.action] ?? event.action}
              </span>
              {#if event.target?.label}<span class="text-muted-foreground"> · {event.target.label}</span>{/if}
            </TableCell>
            <TableCell class="text-sm">{event.project?.slug ?? '—'}</TableCell>
            <TableCell class="text-xs text-muted-foreground max-w-80">
              {#each details(event) as line (line)}<div class="truncate" title={line}>{line}</div>{/each}
            </TableCell>
            <TableCell class="text-xs text-muted-foreground" title={event.userAgent ?? ''}>{event.ip ?? '—'}</TableCell>
          </TableRow>
        {:else}
          <TableRow>
            <td colspan="6" class="p-2 py-10 text-center text-sm text-muted-foreground">No events.</td>
          </TableRow>
        {/each}
      </TableBody>
    </Table>
  </Card>

  {#if data.page?.nextCursor}
    <div class="mt-4 text-center">
      <Button href="/audit?{withParams({ before: String(data.page.nextCursor) })}" variant="outline" size="sm">
        Older events
      </Button>
    </div>
  {/if}
{/if}
