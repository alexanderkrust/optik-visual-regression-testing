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
  import type { Run } from '@optik/shared';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  /** Review state of a run, derived from its snapshots. */
  function runState(run: Run): {
    label: string;
    variant: 'secondary' | 'success' | 'warning';
  } {
    if (run.status === 'running') return { label: 'running', variant: 'secondary' };
    if (run.pendingCount > 0) return { label: 'needs review', variant: 'warning' };
    if (run.changedCount > 0) return { label: 'reviewed', variant: 'success' };
    return { label: 'passed', variant: 'success' };
  }

  let activeTab = $state('runs');

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
    if (!iso) return 'Never';
    const d = new Date(iso);
    if (d < new Date()) return 'Expired';
    return d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function presetLabel(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const EXPIRY_OPTIONS = [
    { value: '30', label: '30 days', hint: presetLabel(30) },
    { value: '60', label: '60 days', hint: presetLabel(60) },
    { value: '90', label: '90 days', hint: presetLabel(90) },
    { value: 'never', label: 'Never', hint: '' },
    { value: 'custom', label: 'Custom date', hint: '' },
  ];


</script>

<svelte:head><title>{data.projectSlug} — optik</title></svelte:head>

<nav class="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
  <a href="/" class="hover:text-foreground transition-colors">Projects</a>
  <ChevronRight class="h-4 w-4" />
  <span class="text-foreground font-medium">{data.projectSlug}</span>
</nav>

<div class="mb-6">
  <h1 class="text-2xl font-bold tracking-tight">{data.projectSlug}</h1>
  <p class="text-muted-foreground text-sm mt-1">
    {data.runs.length} run{data.runs.length === 1 ? '' : 's'}
  </p>
</div>

<Tabs bind:value={activeTab}>
  <TabsList class="mb-6">
    <TabsTrigger value="runs">Runs</TabsTrigger>
    <TabsTrigger value="tokens">Access Tokens</TabsTrigger>
    <TabsTrigger value="settings">Settings</TabsTrigger>
  </TabsList>

  <!-- Runs tab -->
  <TabsContent value="runs">
    {#if !hasValidToken}
      <div class="mb-4 flex items-start gap-3 rounded-md border bg-muted px-4 py-3 text-sm text-foreground">
        <Key class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span>
          {data.tokens.length === 0 ? 'No access token configured yet.' : 'All access tokens have expired.'} <button
            type="button"
            class="font-medium underline underline-offset-2 hover:no-underline"
            onclick={() => (activeTab = 'tokens')}
          >Create an access token</button> first so your adapters can report test runs to this project.
        </span>
      </div>
    {/if}
    {#if data.runs.length === 0}
      <Card>
        <CardContent class="flex flex-col items-center justify-center py-16 text-center">
          <Layers class="text-muted-foreground mb-4 h-12 w-12" />
          <h3 class="font-semibold text-lg">No runs yet</h3>
          <p class="text-muted-foreground text-sm mt-1">Start your first test run using an adapter.</p>
        </CardContent>
      </Card>
    {:else}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Branch</TableHead>
              <TableHead>Suite</TableHead>
              <TableHead>Commit</TableHead>
              <TableHead class="text-center">Snapshots</TableHead>
              <TableHead class="text-center">Changes</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last run</TableHead>
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
                    <Badge variant="warning">{run.pendingCount} to review</Badge>
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
                  {new Date(run.updatedAt).toLocaleString('en', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {#if run.runCount > 1}
                    <span class="ml-1 text-xs" title="{run.runCount} runs without visual changes">
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
        Tokens authenticate your vitest/playwright adapters.
      </p>

      <Dialog bind:open={tokenDialogOpen}>
        <DialogTrigger>
          {#snippet child({ props })}
            <Button variant="outline" size="sm" {...props}>
              <Plus class="h-4 w-4" />
              New Token
            </Button>
          {/snippet}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create access token</DialogTitle>
            <DialogDescription>
              Give this token a name and choose how long it should be valid.
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
              <Label for="token-name">Name</Label>
              <Input
                id="token-name"
                name="name"
                bind:value={tokenName}
                placeholder="CI / local dev"
                required
              />
            </div>

            <div class="space-y-2">
              <Label>Expiration</Label>
              <Select
                type="single"
                bind:value={expiryMode}
                onValueChange={(v) => { if (v !== 'custom') calendarOpen = false; }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select expiry…" />
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
                          {customDate.toDate(tz).toLocaleDateString('en', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        {:else}
                          <span class="text-muted-foreground">Pick a date…</span>
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
                  <Button type="button" variant="outline" {...props}>Cancel</Button>
                {/snippet}
              </DialogClose>
              <Button
                type="submit"
                disabled={creatingToken || (expiryMode === 'custom' && !customDate)}
              >
                {creatingToken ? 'Creating…' : 'Create token'}
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
          <h3 class="font-medium">No tokens yet</h3>
          <p class="text-muted-foreground text-sm mt-1">
            Create a token and add it to your adapter config.
          </p>
        </CardContent>
      </Card>
    {:else}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Created</TableHead>
              <TableHead class="w-16"></TableHead>
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
                      <Badge variant="destructive" class="text-xs">expired</Badge>
                    {/if}
                  </span>
                </TableCell>
                <TableCell class="text-sm {expired ? 'text-destructive' : 'text-muted-foreground'}">
                  {formatExpiry(token.expiresAt)}
                </TableCell>
                <TableCell class="text-muted-foreground text-sm">
                  {new Date(token.createdAt).toLocaleDateString('en', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </TableCell>
                <TableCell>
                  <form method="POST" action="?/revokeToken" use:enhance>
                    <input type="hidden" name="tokenId" value={token.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
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

  <!-- Settings tab -->
  <TabsContent value="settings">
    <Card>
      <CardContent class="p-6">
        <form method="POST" action="?/updateSettings" use:enhance class="space-y-4 max-w-md">
          <div class="space-y-1.5">
            <Label for="default-branch">Default branch</Label>
            <Input
              id="default-branch"
              name="defaultBranch"
              value={data.project.defaultBranch}
              class="font-mono"
              required
            />
            <p class="text-xs text-muted-foreground">
              Baselines come from the git history of each run. When a run has no usable history
              (e.g. a shallow clone in CI), optik falls back to its own branch and then to this one.
            </p>
          </div>

          <Separator />

          <div class="space-y-1">
            <h3 class="text-sm font-semibold">GitHub commit status</h3>
            <p class="text-xs text-muted-foreground">
              Each run reports a status (<code>optik/&lt;suite&gt;</code>) with a link to the review.
              It turns green once all changes are accepted — no need to re-run CI.
            </p>
          </div>
          <div class="space-y-1.5">
            <Label for="github-repo">Repository</Label>
            <Input id="github-repo" name="githubRepo" value={data.project.githubRepo ?? ''} placeholder="owner/repo" class="font-mono" />
          </div>
          <div class="space-y-1.5">
            <Label for="github-token">Token</Label>
            <Input
              id="github-token"
              name="githubToken"
              type="password"
              autocomplete="off"
              placeholder={data.project.githubTokenConfigured ? 'Stored — leave empty to keep' : 'Fine-grained token with "Commit statuses: write"'}
            />
          </div>
          <div class="space-y-1.5">
            <Label for="github-api-url">API URL <span class="font-normal text-muted-foreground">(GitHub Enterprise Server only)</span></Label>
            <Input id="github-api-url" name="githubApiUrl" value={data.project.githubApiUrl ?? ''} placeholder="https://github.example.com/api/v3" class="font-mono" />
          </div>

          <Separator />

          <label class="flex items-start gap-2 text-sm">
            <input type="checkbox" name="failTestsOnChanges" checked={data.project.failTestsOnChanges} class="mt-1" />
            <span>
              Fail tests on visual changes
              <span class="block text-xs text-muted-foreground">
                Turn off when the commit status blocks merging — CI then stays green and the status
                shows what needs review. Adapters can override this with <code>failOnChanges</code>.
              </span>
            </span>
          </label>
          {#if form && 'settingsError' in form}
            <p class="text-sm text-destructive">{(form as { settingsError: string }).settingsError}</p>
          {:else if form && 'settingsSaved' in form}
            <p class="text-sm text-green-700">Saved.</p>
          {/if}
          <Button type="submit" size="sm">Save</Button>
        </form>
      </CardContent>
    </Card>
  </TabsContent>
</Tabs>

<!-- Reveal dialog — shown once after creation -->
<Dialog bind:open={revealDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Token created</DialogTitle>
      <DialogDescription>Copy this token now — it won't be shown again.</DialogDescription>
    </DialogHeader>
    <div class="space-y-4">
      <div class="rounded-md bg-muted px-3 py-2 flex items-center justify-between gap-2">
        <code class="text-sm font-mono break-all select-all">{revealedToken}</code>
        <Button variant="ghost" size="sm" onclick={copyToken} class="shrink-0">
          {#if copied}
            <Check class="h-4 w-4 text-green-600" />
          {:else}
            <Copy class="h-4 w-4" />
          {/if}
        </Button>
      </div>
      <div class="rounded-md border bg-muted/40 px-3 py-3 text-sm space-y-2">
        <p class="font-medium">Add to your adapter config:</p>
        <pre class="font-mono text-xs overflow-x-auto"><code>// vitest
await setupOptik(&#123; token: "{revealedToken}" &#125;)

// playwright
createOptikTest(&#123; token: "{revealedToken}" &#125;)</code></pre>
      </div>
    </div>
    <DialogFooter>
      <DialogClose>
        {#snippet child({ props })}
          <Button {...props}>Done</Button>
        {/snippet}
      </DialogClose>
    </DialogFooter>
  </DialogContent>
</Dialog>
