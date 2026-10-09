<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { ChevronRight, CheckCircle, XCircle, Columns2, GitCompare } from 'lucide-svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import { createApi } from '$lib/api';
  import type { Snapshot, SnapshotStatus } from '@optik/shared';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Use the access token from layout data for authenticated API calls
  const api = createApi((data as any).accessToken ?? undefined);

  const STATUS: Record<
    SnapshotStatus,
    { label: string; variant: 'secondary' | 'outline' | 'warning' | 'success' | 'destructive' }
  > = {
    new: { label: 'new', variant: 'secondary' },
    unchanged: { label: 'unchanged', variant: 'outline' },
    pending: { label: 'changed', variant: 'warning' },
    approved: { label: 'accepted', variant: 'success' },
    rejected: { label: 'rejected', variant: 'destructive' },
  };

  /** Snapshots that differ from their baseline — the only ones that can be reviewed. */
  const isChange = (s: Snapshot) => ['pending', 'approved', 'rejected'].includes(s.status);

  // Changes first (pending on top), then new, then unchanged
  const ORDER: Record<SnapshotStatus, number> = {
    pending: 0,
    rejected: 1,
    approved: 2,
    new: 3,
    unchanged: 4,
  };

  let snapshots = $state(
    untrack(() => [...data.snapshots].sort((a, b) => ORDER[a.status] - ORDER[b.status])),
  );
  let selectedId = $state<string | null>(
    untrack(
      () =>
        data.snapshots.find((s) => s.id === page.url.searchParams.get('snapshot'))?.id ??
        snapshots[0]?.id ??
        null,
    ),
  );
  let view = $state<'compare' | 'diff'>('compare');
  let busy = $state(false);

  const selected = $derived(snapshots.find((s) => s.id === selectedId) ?? null);
  const pending = $derived(snapshots.filter((s) => s.status === 'pending'));
  const changed = $derived(snapshots.filter(isChange).length);

  function replace(updated: Snapshot) {
    snapshots = snapshots.map((s) => (s.id === updated.id ? updated : s));
  }

  async function review(snapshot: Snapshot, status: 'approved' | 'rejected') {
    busy = true;
    try {
      replace(
        status === 'approved'
          ? await api.snapshots.approve(snapshot.id)
          : await api.snapshots.reject(snapshot.id),
      );
      // Jump to the next snapshot that still needs review
      const next = snapshots.find((s) => s.status === 'pending');
      if (next) select(next);
    } finally {
      busy = false;
    }
  }

  async function acceptAll() {
    busy = true;
    try {
      for (const s of pending) replace(await api.snapshots.approve(s.id));
    } finally {
      busy = false;
    }
  }

  function select(s: Snapshot) {
    selectedId = s.id;
    view = 'compare';
  }

  const percent = (score: number | null, digits = 2) => `${((score ?? 0) * 100).toFixed(digits)}%`;
</script>

<svelte:head><title>Run {data.runId.slice(0, 8)} — optik</title></svelte:head>

<nav class="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
  <a href="/" class="hover:text-foreground transition-colors">Projects</a>
  <ChevronRight class="h-4 w-4" />
  <a href="/{data.projectSlug}" class="hover:text-foreground transition-colors">{data.projectSlug}</a>
  <ChevronRight class="h-4 w-4" />
  <span class="text-foreground font-mono">{data.runId.slice(0, 8)}</span>
</nav>

<div class="flex items-center justify-between mb-6 gap-4">
  <div>
    <h1 class="text-2xl font-bold tracking-tight font-mono">{data.runId.slice(0, 8)}</h1>
    <p class="text-muted-foreground text-sm mt-1">
      {snapshots.length} snapshot{snapshots.length === 1 ? '' : 's'}
      {#if pending.length > 0}
        · <span class="text-yellow-600 font-medium">{pending.length} visual change{pending.length === 1 ? '' : 's'} to review</span>
      {:else if changed > 0}
        · all changes reviewed
      {:else}
        · no visual changes
      {/if}
    </p>
    {#if data.run.runCount > 1}
      <p class="text-muted-foreground text-xs mt-1">
        Ran {data.run.runCount} times without visual changes · last run {new Date(
          data.run.updatedAt,
        ).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        {#if data.run.lastCommitSha}
          on <span class="font-mono">{data.run.lastCommitSha.slice(0, 7)}</span>
        {/if}
      </p>
    {/if}
  </div>
  {#if pending.length > 1}
    <Button size="sm" onclick={acceptAll} disabled={busy} class="bg-green-600 hover:bg-green-700">
      <CheckCircle class="h-4 w-4" />
      Accept all {pending.length}
    </Button>
  {/if}
</div>

<div class="flex gap-6 items-start">
  <!-- Snapshot sidebar -->
  <div class="w-56 shrink-0 space-y-1">
    <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 px-1">
      Snapshots
    </p>
    {#each snapshots as snapshot (snapshot.id)}
      <button
        onclick={() => select(snapshot)}
        class="w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all
          {selectedId === snapshot.id
            ? 'border-primary bg-primary/5 text-foreground'
            : 'border-transparent bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground'}"
      >
        <div class="font-medium truncate mb-1">{snapshot.name}</div>
        <div class="flex items-center justify-between">
          <Badge variant={STATUS[snapshot.status].variant} class="text-[10px] px-1.5 py-0">
            {STATUS[snapshot.status].label}
          </Badge>
          {#if isChange(snapshot)}
            <span class="text-xs text-muted-foreground">{percent(snapshot.diffScore, 1)}</span>
          {/if}
        </div>
      </button>
    {/each}

    {#if snapshots.length === 0}
      <p class="text-muted-foreground text-sm px-1">No snapshots yet.</p>
    {/if}
  </div>

  <Separator orientation="vertical" class="h-auto self-stretch" />

  <!-- Snapshot viewer -->
  {#if selected}
    <div class="flex-1 min-w-0">
      <div class="flex items-start justify-between mb-4 gap-4">
        <div>
          <h2 class="text-lg font-semibold">{selected.name}</h2>
          <p class="text-muted-foreground text-sm mt-0.5">
            {#if isChange(selected)}
              {percent(selected.diffScore, 3)} of pixels changed
            {:else if selected.status === 'new'}
              First snapshot — used as the baseline
            {:else}
              Identical to the baseline
            {/if}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          {#if isChange(selected)}
            <Button
              variant="outline"
              size="sm"
              onclick={() => (view = view === 'compare' ? 'diff' : 'compare')}
            >
              {#if view === 'diff'}
                <Columns2 class="h-4 w-4" />
                Before / after
              {:else}
                <GitCompare class="h-4 w-4" />
                Diff
              {/if}
            </Button>
            <Button
              variant={selected.status === 'rejected' ? 'destructive' : 'outline'}
              size="sm"
              disabled={busy || selected.status === 'rejected'}
              onclick={() => review(selected, 'rejected')}
            >
              <XCircle class="h-4 w-4" />
              {selected.status === 'rejected' ? 'Rejected' : 'Reject'}
            </Button>
            <Button
              size="sm"
              disabled={busy || selected.status === 'approved'}
              onclick={() => review(selected, 'approved')}
              class="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle class="h-4 w-4" />
              {selected.status === 'approved' ? 'Accepted' : 'Accept'}
            </Button>
          {:else}
            <Badge variant={STATUS[selected.status].variant}>{STATUS[selected.status].label}</Badge>
          {/if}
        </div>
      </div>

      {#if isChange(selected) && selected.baselineId && view === 'compare'}
        <div class="grid grid-cols-2 gap-4">
          <Card>
            <CardContent class="p-4">
              <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Before (baseline)
              </p>
              <img
                src={selected.baselineImageUrl}
                alt="{selected.name} — baseline"
                class="max-w-full rounded"
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                After (this run)
              </p>
              <img
                src={selected.imageUrl}
                alt="{selected.name} — this run"
                class="max-w-full rounded"
              />
            </CardContent>
          </Card>
        </div>
      {:else}
        <Card>
          <CardContent class="p-4">
            {#if isChange(selected) && view === 'diff'}
              <img
                src={selected.diffUrl}
                alt="{selected.name} — diff"
                class="max-w-full rounded"
              />
            {:else}
              <img
                src={selected.imageUrl}
                alt={selected.name}
                class="max-w-full rounded"
              />
            {/if}
          </CardContent>
        </Card>
      {/if}
    </div>
  {:else}
    <div class="flex-1 flex items-center justify-center py-24 text-muted-foreground">
      <p>Select a snapshot to review</p>
    </div>
  {/if}
</div>
