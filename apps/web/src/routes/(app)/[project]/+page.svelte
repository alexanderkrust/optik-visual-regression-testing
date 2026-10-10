<script lang="ts">
  import { enhance } from '$app/forms';
  import {
    ChevronRight,
    GitBranch,
    GitCommit,
    Layers,
    Plus,
    Key,
    Trash2,
    Copy,
    Check,
    AlertCircle,
    CalendarIcon,
  } from 'lucide-svelte';
  import { today, getLocalTimeZone } from '@internationalized/date';
  import type { DateValue } from '@internationalized/date';
  import { Badge } from '$lib/components/ui/badge';
  import { Separator } from '$lib/components/ui/separator';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent } from '$lib/components/ui/card';
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
  import { Calendar } from '$lib/components/ui/calendar';
  import { Popover, PopoverTrigger, PopoverContent } from '$lib/components/ui/popover';
  import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
  } from '$lib/components/ui/select';
  import { Tabs, TabsList, TabsTrigger, TabsContent } from '$lib/components/ui/tabs';
  import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
  } from '$lib/components/ui/table';
  import type { PageData, ActionData } from './$types';
  import type { CiProvider, Run } from '@optik/shared';
  import { untrack } from 'svelte';
  import { useI18n } from '$lib/i18n';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const { m, f } = useI18n();
  const t = m.project;

  /** Review state of a run, derived from its snapshots. */
  function runState(run: Run): {
    label: string;
    variant: 'secondary' | 'success' | 'warning';
  } {
    if (run.status === 'running') return { label: t.state.running, variant: 'secondary' };
    if (run.pendingCount > 0) return { label: t.state.needsReview, variant: 'warning' };
    if (run.changedCount > 0) return { label: t.state.reviewed, variant: 'success' };
    return { label: t.state.passed, variant: 'success' };
  }

  const selectClass =
    'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  let activeTab = $state('runs');

  /** Form hints per CI system (see CiProvider in @optik/shared); texts in m.project.ci */
  const CI_PROVIDERS: Record<
    CiProvider,
    { label: string; repository: string; token: string; apiUrl: string; apiUrlNote: string | null }
  > = {
    github: { label: 'GitHub', apiUrl: 'https://github.example.com/api/v3', ...t.ci.github },
    gitlab: { label: 'GitLab', apiUrl: 'https://gitlab.example.com/api/v4', ...t.ci.gitlab },
    bitbucket: { label: 'Bitbucket Cloud', apiUrl: '', ...t.ci.bitbucket },
    bitbucket_server: { label: 'Bitbucket Data Center', apiUrl: 'https://bitbucket.example.com', ...t.ci.bitbucket_server },
    azure_devops: { label: 'Azure DevOps', apiUrl: 'https://dev.azure.com/your-organization', ...t.ci.azure_devops },
  };
  let ciProvider = $state<CiProvider | ''>(untrack(() => data.project.ciProvider ?? ''));
  const ci = $derived(ciProvider ? CI_PROVIDERS[ciProvider] : null);

  const now = new Date();
  const hasValidToken = $derived(
    data.tokens.some((t) => !t.expiresAt || new Date(t.expiresAt) > now),
  );

  // ── Token creation dialog ──────────────────────────────────────────────────
  let tokenDialogOpen = $state(false);
  let tokenName = $state('');
  let creatingToken = $state(false);
  let expiryMode = $state('');
  let customDate = $state<DateValue | undefined>(undefined);
  let calendarOpen = $state(false);

  const tz = getLocalTimeZone();
  const todayDate = today(tz);

  // ISO string sent with the form, or empty for "never"
  let expiresAt = $derived(
    expiryMode === 'never'
      ? null
      : expiryMode === 'custom'
        ? customDate
          ? customDate.toDate(tz).toISOString()
          : ''
        : (() => {
            const d = new Date();
            d.setDate(d.getDate() + Number(expiryMode));
            return d.toISOString();
          })(),
  );

  $effect(() => {
    if (!tokenDialogOpen) {
      tokenName = '';
      expiryMode = '';
      customDate = undefined;
    }
  });

  // ── Reveal dialog (token shown once) ──────────────────────────────────────
  let revealedToken = $state<string | null>(null);
  let revealDialogOpen = $state(false);
  let copied = $state(false);

  $effect(() => {
    if (form && 'createdToken' in form && form.createdToken) {
      revealedToken = form.createdToken as string;
      tokenDialogOpen = false;
      revealDialogOpen = true;
    }
  });

  function copyToken() {
    if (!revealedToken) return;
    navigator.clipboard.writeText(revealedToken);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  function formatExpiry(iso: string | null): string {
    if (!iso) return t.never;
    const d = new Date(iso);
    if (d < new Date()) return t.expiredLong;
    return f.date(d);
  }

  function presetLabel(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return f.date(d);
  }

  const EXPIRY_OPTIONS = [
    { value: '30', label: t.days(30), hint: presetLabel(30) },
    { value: '60', label: t.days(60), hint: presetLabel(60) },
    { value: '90', label: t.days(90), hint: presetLabel(90) },
    { value: 'never', label: t.never, hint: '' },
    { value: 'custom', label: t.customDate, hint: '' },
  ];
</script>

<svelte:head><title>{m.common.title(data.projectSlug)}</title></svelte:head>

<nav class="flex items-center gap-1.5 text-sm text-muted-foreground mb-6" aria-label={m.nav.breadcrumb}>
  <a href="/" class="hover:text-foreground transition-colors">{m.nav.projects}</a>
  <ChevronRight class="h-4 w-4" />
  <span class="text-foreground font-medium">{data.projectSlug}</span>
</nav>

<div class="mb-6">
  <h1 class="text-2xl font-bold tracking-tight">{data.projectSlug}</h1>
  <p class="text-muted-foreground text-sm mt-1">
    {t.runCount(data.runs.length)}
  </p>
</div>

<Tabs bind:value={activeTab}>
  <TabsList class="mb-6">
    <TabsTrigger value="runs">{t.tabs.runs}</TabsTrigger>
    {#if data.manages}
      <TabsTrigger value="members">{t.tabs.members}</TabsTrigger>
      <TabsTrigger value="tokens">{t.tabs.tokens}</TabsTrigger>
      <TabsTrigger value="settings">{t.tabs.settings}</TabsTrigger>
    {/if}
  </TabsList>

  <!-- Runs tab -->
  <TabsContent value="runs">
    {#if data.manages && !hasValidToken}
      <div class="mb-4 flex items-start gap-3 rounded-md border bg-muted px-4 py-3 text-sm text-foreground">
        <Key class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span>
          {data.tokens.length === 0 ? t.noToken : t.tokensExpired} <button
            type="button"
            class="font-medium underline underline-offset-2 hover:no-underline"
            onclick={() => (activeTab = 'tokens')}
          >{t.createTokenLink}</button> {t.createTokenHint}
        </span>
      </div>
    {/if}
    {#if data.runs.length === 0}
      <Card>
        <CardContent class="flex flex-col items-center justify-center py-16 text-center">
          <Layers class="text-muted-foreground mb-4 h-12 w-12" />
          <h3 class="font-semibold text-lg">{t.noRuns}</h3>
          <p class="text-muted-foreground text-sm mt-1">{t.noRunsHint}</p>
        </CardContent>
      </Card>
    {:else}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.branch}</TableHead>
              <TableHead>{t.suite}</TableHead>
              <TableHead>{t.commit}</TableHead>
              <TableHead class="text-center">{t.snapshots}</TableHead>
              <TableHead class="text-center">{t.changes}</TableHead>
              <TableHead>{t.status}</TableHead>
              <TableHead>{t.lastRun}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each data.runs as run (run.id)}
              <TableRow
                class="cursor-pointer"
                onclick={() => (window.location.href = `/${data.projectSlug}/${run.id}`)}
              >
                <TableCell>
                  <span class="flex items-center gap-1.5 font-mono text-sm">
                    <GitBranch class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {run.branch}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" class="font-mono text-xs">{run.suite}</Badge>
                </TableCell>
                <TableCell>
                  <span class="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    <GitCommit class="h-3.5 w-3.5 shrink-0" />
                    {run.commitSha.slice(0, 7)}
                    {#if run.lastCommitSha && run.lastCommitSha !== run.commitSha}
                      … {run.lastCommitSha.slice(0, 7)}
                    {/if}
                  </span>
                </TableCell>
                <TableCell class="text-center">{run.snapshotCount}</TableCell>
                <TableCell class="text-center">
                  {#if run.pendingCount > 0}
                    <Badge variant="warning">{t.toReview(run.pendingCount)}</Badge>
                  {:else if run.changedCount > 0}
                    <span class="text-sm">{run.changedCount}</span>
                  {:else}
                    <span class="text-muted-foreground text-sm">—</span>
                  {/if}
                </TableCell>
                <TableCell>
                  {@const state = runState(run)}
                  <Badge variant={state.variant}>{state.label}</Badge>
                </TableCell>
                <TableCell class="text-muted-foreground text-sm">
                  {f.dateTime(run.updatedAt)}
                  {#if run.runCount > 1}
                    <span class="ml-1 text-xs" title={t.unchangedRuns(run.runCount)}>
                      ×{run.runCount}
                    </span>
                  {/if}
                </TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </Card>
    {/if}
  </TabsContent>

  <!-- Access Tokens tab -->
  <TabsContent value="tokens">
    <div class="flex items-center justify-between mb-4">
      <p class="text-muted-foreground text-sm">
        {t.tokensIntro}
      </p>

      <Dialog bind:open={tokenDialogOpen}>
        <DialogTrigger>
          {#snippet child({ props })}
            <Button variant="outline" size="sm" {...props}>
              <Plus class="h-4 w-4" />
              {t.newToken}
            </Button>
          {/snippet}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.createTokenTitle}</DialogTitle>
            <DialogDescription>
              {t.createTokenDescription}
            </DialogDescription>
          </DialogHeader>
          <form
            method="POST"
            action="?/createToken"
            use:enhance={() => {
              creatingToken = true;
              return async ({ update }) => {
                creatingToken = false;
                await update({ reset: false });
              };
            }}
            class="space-y-5"
          >
            <input type="hidden" name="expiresAt" value={expiresAt} />

            {#if form && 'tokenError' in form}
              <div
                class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
                <span>{(form as { tokenError: string }).tokenError}</span>
              </div>
            {/if}

            <div class="space-y-2">
              <Label for="token-name">{m.common.name}</Label>
              <Input
                id="token-name"
                name="name"
                bind:value={tokenName}
                placeholder={t.tokenNamePlaceholder}
                required
              />
            </div>

            <div class="space-y-2">
              <Label>{t.expiration}</Label>
              <Select
                type="single"
                bind:value={expiryMode}
                onValueChange={(v) => { if (v !== 'custom') calendarOpen = false; }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t.selectExpiry} />
                </SelectTrigger>
                <SelectContent>
                  {#each EXPIRY_OPTIONS as opt (opt.value)}
                    <SelectItem value={opt.value}>
                      {opt.label}{opt.hint ? ` (${opt.hint})` : ''}
                    </SelectItem>
                  {/each}
                </SelectContent>
              </Select>

              {#if expiryMode === 'custom'}
                <Popover bind:open={calendarOpen}>
                  <PopoverTrigger>
                    {#snippet child({ props })}
                      <button
                        type="button"
                        {...props}
                        class="mt-1 flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
                      >
                        <CalendarIcon class="h-4 w-4 text-muted-foreground shrink-0" />
                        {#if customDate}
                          {f.date(customDate.toDate(tz))}
                        {:else}
                          <span class="text-muted-foreground">{t.pickDate}</span>
                        {/if}
                      </button>
                    {/snippet}
                  </PopoverTrigger>
                  <PopoverContent class="w-auto p-0 rounded-md border bg-popover shadow-md z-50">
                    <Calendar
                      bind:value={customDate}
                      minValue={todayDate}
                      onValueChange={() => (calendarOpen = false)}
                    />
                  </PopoverContent>
                </Popover>
              {/if}
            </div>

            <DialogFooter>
              <DialogClose>
                {#snippet child({ props })}
                  <Button type="button" variant="outline" {...props}>{m.common.cancel}</Button>
                {/snippet}
              </DialogClose>
              <Button
                type="submit"
                disabled={creatingToken || (expiryMode === 'custom' && !customDate)}
              >
                {creatingToken ? t.creating : t.createToken}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>

    {#if data.tokens.length === 0}
      <Card>
        <CardContent class="flex flex-col items-center justify-center py-10 text-center">
          <Key class="text-muted-foreground mb-3 h-8 w-8" />
          <h3 class="font-medium">{t.noTokens}</h3>
          <p class="text-muted-foreground text-sm mt-1">
            {t.noTokensHint}
          </p>
        </CardContent>
      </Card>
    {:else}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.common.name}</TableHead>
              <TableHead>{t.expires}</TableHead>
              <TableHead>{t.created}</TableHead>
              <TableHead class="w-16"><span class="sr-only">{m.common.actions}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each data.tokens as token (token.id)}
              {@const expired = token.expiresAt ? new Date(token.expiresAt) < new Date() : false}
              <TableRow>
                <TableCell class="font-medium">
                  <span class="flex items-center gap-2">
                    {token.name}
                    <span class="font-mono text-xs text-muted-foreground">{token.prefix}…</span>
                    {#if expired}
                      <Badge variant="destructive" class="text-xs">{t.expired}</Badge>
                    {/if}
                  </span>
                </TableCell>
                <TableCell class="text-sm {expired ? 'text-destructive' : 'text-muted-foreground'}">
                  {formatExpiry(token.expiresAt)}
                </TableCell>
                <TableCell class="text-muted-foreground text-sm">
                  {f.date(token.createdAt)}
                </TableCell>
                <TableCell>
                  <form method="POST" action="?/revokeToken" use:enhance>
                    <input type="hidden" name="tokenId" value={token.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      aria-label={t.revokeToken(token.name)}
                      class="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 class="h-4 w-4" />
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </Card>
    {/if}
  </TabsContent>

  <!-- Members tab -->
  <TabsContent value="members">
    <Card class="mb-4">
      <CardContent class="p-6">
        <form method="POST" action="?/setMember" use:enhance class="flex flex-wrap items-end gap-3">
          <div class="flex flex-col gap-1.5 flex-1 min-w-56">
            <Label for="member-email">{t.addUser}</Label>
            <Input id="member-email" name="email" type="email" required placeholder="jane@example.com" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="member-role">{m.common.role}</Label>
            <select id="member-role" name="role" class={selectClass}>
              <option value="viewer">{m.roles.viewer}</option>
              <option value="reviewer">{m.roles.reviewer}</option>
              <option value="maintainer">{m.roles.maintainer}</option>
            </select>
          </div>
          <Button type="submit" size="sm">{m.common.add}</Button>
        </form>
        {#if form && 'memberError' in form}
          <p class="mt-3 text-sm text-destructive">{(form as { memberError: string }).memberError}</p>
        {/if}
        <p class="mt-3 text-xs text-muted-foreground">
          {t.rolesHint} <em>{t.rolesHintUsers}</em> {t.rolesHintAdmins}
        </p>
      </CardContent>
    </Card>

    {#if data.members.length > 0}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.common.email}</TableHead>
              <TableHead>{m.common.role}</TableHead>
              <TableHead class="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each data.members as member (member.userId)}
              <TableRow>
                <TableCell class="font-medium">{member.email}</TableCell>
                <TableCell>
                  <form method="POST" action="?/setMember" use:enhance>
                    <input type="hidden" name="email" value={member.email} />
                    <select
                      name="role"
                      class={selectClass}
                      value={member.role}
                      aria-label={t.roleOf(member.email)}
                      onchange={(e) => e.currentTarget.form?.requestSubmit()}
                    >
                      <option value="viewer">{m.roles.viewer}</option>
                      <option value="reviewer">{m.roles.reviewer}</option>
                      <option value="maintainer">{m.roles.maintainer}</option>
                    </select>
                  </form>
                </TableCell>
                <TableCell>
                  <form method="POST" action="?/removeMember" use:enhance>
                    <input type="hidden" name="userId" value={member.userId} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={t.removeMember(member.email)}>
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
    {#if data.teams.length > 0}
      <h2 class="mt-6 mb-2 text-sm font-semibold">{t.teamsWithAccess}</h2>
      <Card>
        <Table>
          <TableBody>
            {#each data.teams as team (team.teamId)}
              <TableRow>
                <TableCell class="font-medium">{team.name}</TableCell>
                <TableCell class="text-sm text-muted-foreground">{t.teamMembers(team.members)}</TableCell>
                <TableCell class="text-sm">{m.roles[team.role]}</TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </Card>
      <p class="mt-2 text-xs text-muted-foreground">
        {t.teamsHint}
        {#if data.user.role === 'admin'}<a href="/teams" class="underline">{t.manageTeams}</a>{/if}
      </p>
    {/if}
  </TabsContent>

  <!-- Settings tab -->
  <TabsContent value="settings">
    <Card>
      <CardContent class="p-6">
        <form method="POST" action="?/updateSettings" use:enhance class="space-y-4 max-w-md">
          <div class="space-y-1.5">
            <Label for="default-branch">{t.defaultBranch}</Label>
            <Input
              id="default-branch"
              name="defaultBranch"
              value={data.project.defaultBranch}
              class="font-mono"
              required
            />
            <p class="text-xs text-muted-foreground">
              {t.defaultBranchHint}
            </p>
          </div>

          <Separator />

          <div class="space-y-1">
            <h2 class="text-sm font-semibold">{t.commitStatus}</h2>
            <p class="text-xs text-muted-foreground">
              {t.commitStatusHint1} (<code>optik/&lt;suite&gt;</code>) {t.commitStatusHint2}
            </p>
          </div>
          <div class="space-y-1.5">
            <Label for="ci-provider">{t.ciSystem}</Label>
            <select id="ci-provider" name="ciProvider" class="{selectClass} w-full" bind:value={ciProvider}>
              <option value="">{t.off}</option>
              {#each Object.entries(CI_PROVIDERS) as [value, provider] (value)}
                <option {value}>{provider.label}</option>
              {/each}
            </select>
          </div>
          {#if ci}
            <div class="space-y-1.5">
              <Label for="ci-repository">{t.repository}</Label>
              <Input id="ci-repository" name="ciRepository" value={data.project.ciRepository ?? ''} placeholder={ci.repository} class="font-mono" />
            </div>
            <div class="space-y-1.5">
              <Label for="ci-token">{t.token}</Label>
              <Input
                id="ci-token"
                name="ciToken"
                type="password"
                autocomplete="off"
                placeholder={data.project.ciTokenConfigured && ciProvider === data.project.ciProvider ? t.tokenStored : ci.token}
              />
            </div>
            {#if ci.apiUrlNote}
              <div class="space-y-1.5">
                <Label for="ci-api-url">{t.apiUrl} <span class="font-normal text-muted-foreground">({ci.apiUrlNote})</span></Label>
                <Input id="ci-api-url" name="ciApiUrl" value={data.project.ciApiUrl ?? ''} placeholder={ci.apiUrl} class="font-mono" />
              </div>
            {:else}
              <input type="hidden" name="ciApiUrl" value="" />
            {/if}
            <p class="text-xs text-muted-foreground">
              {t.tokenEncrypted}
            </p>
          {/if}

          <Separator />

          <label class="flex items-start gap-2 text-sm">
            <input type="checkbox" name="failTestsOnChanges" checked={data.project.failTestsOnChanges} class="mt-1" />
            <span>
              {t.failTests}
              <span class="block text-xs text-muted-foreground">
                {t.failTestsHint1} <code>failOnChanges</code>.
              </span>
            </span>
          </label>
          {#if form && 'settingsError' in form}
            <p class="text-sm text-destructive">{(form as { settingsError: string }).settingsError}</p>
          {:else if form && 'settingsSaved' in form}
            <p class="text-sm text-green-700">{m.common.saved}</p>
          {/if}
          <Button type="submit" size="sm">{m.common.save}</Button>
        </form>
      </CardContent>
    </Card>

    <Card class="mt-4">
      <CardContent class="p-6 space-y-4">
        <div class="space-y-1">
          <h2 class="text-sm font-semibold">{t.notifications}</h2>
          <p class="text-xs text-muted-foreground">
            {t.notificationsIntro}
          </p>
        </div>

        {#if data.channels.length > 0}
          <ul class="divide-y rounded-md border">
            {#each data.channels as channel (channel.id)}
              <li class="flex items-center gap-3 px-3 py-2 text-sm">
                <Badge variant="outline" class="capitalize">{channel.type}</Badge>
                <span class="flex-1 truncate font-mono text-xs">{channel.label}</span>
                <span class="text-xs text-muted-foreground">
                  {channel.events.map((e) => (e === 'run.needs_review' ? t.eventChanges : t.eventReviewed)).join(' · ')}
                </span>
                {#if form && 'testedChannel' in form && form.testedChannel === channel.id}
                  <span class="text-xs {form.delivered ? 'text-green-700' : 'text-destructive'}">
                    {form.delivered ? t.delivered : t.deliveryFailed}
                  </span>
                {/if}
                <form method="POST" action="?/testChannel" use:enhance>
                  <input type="hidden" name="id" value={channel.id} />
                  <Button type="submit" variant="outline" size="sm">{t.sendTest}</Button>
                </form>
                <form method="POST" action="?/removeChannel" use:enhance>
                  <input type="hidden" name="id" value={channel.id} />
                  <Button type="submit" variant="ghost" size="sm" aria-label={t.removeChannel(channel.type)}>
                    <Trash2 class="h-4 w-4 text-muted-foreground" />
                  </Button>
                </form>
              </li>
            {/each}
          </ul>
        {/if}

        <form method="POST" action="?/addChannel" use:enhance class="flex flex-wrap items-end gap-3">
          <div class="flex flex-col gap-1.5">
            <Label for="channel-type">{t.type}</Label>
            <select id="channel-type" name="type" class={selectClass}>
              <option value="slack">Slack</option>
              <option value="teams">Microsoft Teams</option>
              <option value="webhook">Webhook</option>
              <option value="email">{t.email}</option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5 flex-1 min-w-64">
            <Label for="channel-target">{t.target}</Label>
            <Input id="channel-target" name="target" required placeholder="https://hooks.slack.com/services/…" class="font-mono" />
          </div>
          <div class="flex items-center gap-3 text-sm pb-2">
            <label class="flex items-center gap-1.5"><input type="checkbox" name="events" value="run.needs_review" checked /> {t.changesEvent}</label>
            <label class="flex items-center gap-1.5"><input type="checkbox" name="events" value="run.reviewed" checked /> {t.reviewedEvent}</label>
          </div>
          <Button type="submit" size="sm">{m.common.add}</Button>
        </form>
        <p class="text-xs text-muted-foreground">
          {t.channelsHint}
        </p>
        {#if form && 'channelError' in form}
          <p class="text-sm text-destructive">{(form as { channelError: string }).channelError}</p>
        {/if}
        {#if form && 'webhookSecret' in form && form.webhookSecret}
          <div class="rounded-md border bg-muted/50 p-3 text-sm space-y-1">
            <p>{t.webhookSecret1} <code>X-Optik-Signature</code> {t.webhookSecret2}</p>
            <code class="block break-all rounded bg-background px-2 py-1 text-xs font-mono select-all">{form.webhookSecret}</code>
          </div>
        {/if}
      </CardContent>
    </Card>

    {#if data.storage}
      {@const storage = data.storage}
      <Card class="mt-4">
        <CardContent class="p-6 space-y-4">
          <div class="space-y-1">
            <h2 class="text-sm font-semibold">{t.storage}</h2>
            <p class="text-xs text-muted-foreground">
              {t.storageUsage(f.bytes(storage.bytes), storage.images, storage.runs, storage.snapshots)}
              {#if storage.unmeasured > 0}
                · {t.unmeasured(storage.unmeasured)}
              {/if}
            </p>
          </div>
          <form method="POST" action="?/setRetention" use:enhance class="flex flex-wrap items-end gap-3">
            <div class="space-y-1.5">
              <Label for="retention-days">{t.keepRuns}</Label>
              <Input
                id="retention-days"
                name="days"
                type="number"
                min="1"
                max="3650"
                class="w-40"
                value={data.project.retentionDays ?? ''}
                placeholder={t.forever}
              />
            </div>
            <Button type="submit" size="sm" variant="outline">{m.common.save}</Button>
            {#if data.project.retentionDays}
              <Button type="submit" size="sm" variant="ghost" formaction="?/runRetention">{t.cleanUp}</Button>
            {/if}
          </form>
          <p class="text-xs text-muted-foreground">
            {t.retentionHint}
          </p>
          {#if form && 'retentionError' in form}<p class="text-sm text-destructive">{form.retentionError}</p>{/if}
          {#if form && 'retentionSaved' in form}<p class="text-sm text-green-700">{m.common.saved}</p>{/if}
          {#if form && 'retentionResult' in form && form.retentionResult}
            <p class="text-sm text-green-700">
              {t.retentionResult(
                form.retentionResult.runsDeleted,
                form.retentionResult.snapshotsDeleted,
                f.bytes(form.retentionResult.bytesFreed),
              )}
            </p>
          {/if}
        </CardContent>
      </Card>
    {/if}
  </TabsContent>
</Tabs>

<!-- Reveal dialog — shown once after creation -->
<Dialog bind:open={revealDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{t.tokenCreated}</DialogTitle>
      <DialogDescription>{t.tokenOnce}</DialogDescription>
    </DialogHeader>
    <div class="space-y-4">
      <div class="rounded-md bg-muted px-3 py-2 flex items-center justify-between gap-2">
        <code class="text-sm font-mono break-all select-all">{revealedToken}</code>
        <Button variant="ghost" size="sm" onclick={copyToken} class="shrink-0" aria-label={copied ? m.common.copied : t.copyToken}>
          {#if copied}
            <Check class="h-4 w-4 text-green-600" />
          {:else}
            <Copy class="h-4 w-4" />
          {/if}
        </Button>
      </div>
      <div class="rounded-md border bg-muted/40 px-3 py-3 text-sm space-y-2">
        <p class="font-medium">{t.addToConfig}</p>
        <pre class="font-mono text-xs overflow-x-auto"><code>// vitest
await setupOptik(&#123; token: "{revealedToken}" &#125;)

// playwright
createOptikTest(&#123; token: "{revealedToken}" &#125;)</code></pre>
      </div>
    </div>
    <DialogFooter>
      <DialogClose>
        {#snippet child({ props })}
          <Button {...props}>{t.done}</Button>
        {/snippet}
      </DialogClose>
    </DialogFooter>
  </DialogContent>
</Dialog>
