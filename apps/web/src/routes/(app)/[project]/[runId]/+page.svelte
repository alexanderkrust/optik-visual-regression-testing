<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import {
    ChevronRight,
    CheckCircle,
    XCircle,
    Columns2,
    SplitSquareHorizontal,
    Layers,
    GitCompare,
    ZoomIn,
    ZoomOut,
    Scan,
    Keyboard,
    MessageSquare,
  } from 'lucide-svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Separator } from '$lib/components/ui/separator';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
  } from '$lib/components/ui/dialog';
  import ImageCompare, { type CompareMode, type Zoom } from '$lib/components/review/image-compare.svelte';
  import SnapshotComments from '$lib/components/review/snapshot-comments.svelte';
  import { createApi } from '$lib/api';
  import type { IgnoreRegion, Snapshot, SnapshotStatus } from '@optik/shared';
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

  const VIEWS: { mode: CompareMode; label: string; icon: typeof Columns2 }[] = [
    { mode: 'side', label: 'Side by side', icon: Columns2 },
    { mode: 'slider', label: 'Slider', icon: SplitSquareHorizontal },
    { mode: 'onion', label: 'Overlay', icon: Layers },
    { mode: 'diff', label: 'Diff', icon: GitCompare },
  ];
  const ZOOMS = [0.25, 0.5, 1, 2, 4];
  const VIEW_KEY = 'optik.review.view';

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
  let view = $state<CompareMode>('side');
  // The remembered view is only known in the browser — read it after hydration
  $effect(() => {
    view = untrack(readView);
  });
  let zoom = $state<Zoom>('fit');
  let busy = $state(false);
  let helpOpen = $state(false);
  let commentBox = $state<HTMLTextAreaElement>();

  // Editing the ignore regions and threshold of the selected snapshot
  let editing = $state(false);
  let draftRegions = $state<IgnoreRegion[]>([]);
  let draftThreshold = $state('0');
  let settingsError = $state<string | null>(null);

  const selected = $derived(snapshots.find((s) => s.id === selectedId) ?? null);
  const pending = $derived(snapshots.filter((s) => s.status === 'pending'));
  const changed = $derived(snapshots.filter(isChange).length);
  // Changes, and unchanged snapshots that differ within their threshold, have a diff
  const comparable = $derived(!!selected?.diffUrl && !!selected.baselineImageUrl);
  const mode = $derived<CompareMode>(editing || !comparable ? 'single' : view);

  function readView(): CompareMode {
    try {
      const stored = localStorage.getItem(VIEW_KEY);
      if (VIEWS.some((v) => v.mode === stored)) return stored as CompareMode;
    } catch {
      // storage unavailable
    }
    return 'side';
  }

  function setView(mode: CompareMode) {
    view = mode;
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {
      // storage unavailable
    }
  }

  function setCommentCount(id: string, commentCount: number) {
    snapshots = snapshots.map((s) => (s.id === id ? { ...s, commentCount } : s));
  }

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
    editing = false;
    const url = new URL(page.url);
    url.searchParams.set('snapshot', s.id);
    replaceState(url, page.state);
  }

  function step(offset: number) {
    const index = snapshots.findIndex((s) => s.id === selectedId);
    const next = snapshots[index + offset];
    if (next) {
      select(next);
      document.getElementById(`snapshot-${next.id}`)?.scrollIntoView({ block: 'nearest' });
    }
  }

  function zoomBy(direction: 1 | -1) {
    const current = zoom === 'fit' ? 1 : zoom;
    const next = direction > 0 ? ZOOMS.find((z) => z > current) : [...ZOOMS].reverse().find((z) => z < current);
    if (next) zoom = next;
  }

  function startEditing() {
    if (!selected) return;
    draftRegions = selected.settings.ignoreRegions.map((r) => ({ ...r }));
    draftThreshold = String(+(selected.settings.threshold * 100).toFixed(3));
    settingsError = null;
    editing = true;
  }

  async function saveSettings() {
    if (!selected) return;
    const threshold = Number(draftThreshold.replace(',', '.'));
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      settingsError = 'The threshold is a percentage between 0 and 100.';
      return;
    }
    busy = true;
    try {
      replace(
        await api.snapshots.updateSettings(selected.id, {
          ignoreRegions: draftRegions,
          threshold: threshold / 100,
        }),
      );
      editing = false;
    } catch (e) {
      settingsError = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (helpOpen) return;

    const s = selected;
    const reviewable = !!s && data.canReview && isChange(s) && !busy && !editing;
    const handled = (() => {
      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          return step(1), true;
        case 'k':
        case 'ArrowUp':
          return step(-1), true;
        case '1':
        case '2':
        case '3':
        case '4':
          if (!comparable || editing) return false;
          return setView(VIEWS[Number(e.key) - 1].mode), true;
        case 'a':
          if (!reviewable || s.status === 'approved') return false;
          return review(s, 'approved'), true;
        case 'r':
          if (!reviewable || s.status === 'rejected') return false;
          return review(s, 'rejected'), true;
        case 'z':
          zoom = zoom === 'fit' ? 1 : zoom === 1 ? 2 : 'fit';
          return true;
        case '0':
          zoom = 'fit';
          return true;
        case '+':
        case '=':
          return zoomBy(1), true;
        case '-':
          return zoomBy(-1), true;
        case 'i':
          if (!data.canReview || !s || editing) return false;
          return startEditing(), true;
        case 'c':
          if (!commentBox) return false;
          return commentBox.focus(), true;
        case 'Escape':
          if (!editing) return false;
          editing = false;
          return true;
        case '?':
          helpOpen = true;
          return true;
      }
      return false;
    })();
    if (handled) e.preventDefault();
  }

  const percent = (score: number | null, digits = 2) => `${((score ?? 0) * 100).toFixed(digits)}%`;
  const thresholdLabel = (t: number) => `${+(t * 100).toFixed(3)}%`;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const SHORTCUTS: [string, string][] = [
    ['J / ↓', 'Next snapshot'],
    ['K / ↑', 'Previous snapshot'],
    ['1 – 4', 'Side by side, slider, overlay, diff'],
    ['A', 'Accept change'],
    ['R', 'Reject change'],
    ['Z', 'Zoom: fit → 100% → 200%'],
    ['+ / − / 0', 'Zoom in, out, fit'],
    ['I', 'Edit ignore regions and threshold'],
    ['C', 'Write a comment'],
    ['Esc', 'Stop editing'],
    ['?', 'This help'],
  ];
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head><title>Run {data.runId.slice(0, 8)} — optik</title></svelte:head>

<nav class="flex items-center gap-1.5 text-sm text-muted-foreground mb-6" aria-label="Breadcrumb">
  <a href="/" class="hover:text-foreground transition-colors">Projects</a>
  <ChevronRight class="h-4 w-4" />
  <a href="/{data.projectSlug}" class="hover:text-foreground transition-colors">{data.projectSlug}</a>
  <ChevronRight class="h-4 w-4" />
  <span class="text-foreground font-mono">{data.runId.slice(0, 8)}</span>
</nav>

<div class="flex items-center justify-between mb-6 gap-4">
  <div>
    <h1 class="text-2xl font-bold tracking-tight font-mono flex items-center gap-3">
      {data.runId.slice(0, 8)}
      <Badge variant="outline" class="font-mono text-xs font-normal">{data.run.suite}</Badge>
      <span class="text-sm font-normal text-muted-foreground">{data.run.branch}</span>
    </h1>
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
  <div class="flex items-center gap-2">
    <Button variant="ghost" size="sm" onclick={() => (helpOpen = true)} aria-label="Keyboard shortcuts">
      <Keyboard class="h-4 w-4" />
      <span class="hidden sm:inline">Shortcuts</span>
      <kbd class="rounded border bg-muted px-1 text-[10px] font-mono">?</kbd>
    </Button>
    {#if data.canReview && pending.length > 1}
      <Button size="sm" onclick={acceptAll} disabled={busy} class="bg-green-600 hover:bg-green-700">
        <CheckCircle class="h-4 w-4" />
        Accept all {pending.length}
      </Button>
    {/if}
  </div>
</div>

<div class="flex gap-6 items-start">
  <!-- Snapshot sidebar -->
  <div class="w-56 shrink-0 space-y-1 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
    <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 px-1">
      Snapshots
    </p>
    {#each snapshots as snapshot (snapshot.id)}
      <button
        id="snapshot-{snapshot.id}"
        onclick={() => select(snapshot)}
        class="w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all
          {selectedId === snapshot.id
            ? 'border-primary bg-primary/5 text-foreground'
            : 'border-transparent bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground'}"
      >
        <div class="font-medium truncate mb-1">{snapshot.name}</div>
        <div class="flex items-center justify-between gap-2">
          <Badge variant={STATUS[snapshot.status].variant} class="text-[10px] px-1.5 py-0">
            {STATUS[snapshot.status].label}
          </Badge>
          <span class="flex items-center gap-2 text-xs text-muted-foreground">
            {#if snapshot.commentCount > 0}
              <span class="flex items-center gap-0.5" title="{plural(snapshot.commentCount, 'comment')}">
                <MessageSquare class="h-3 w-3" />{snapshot.commentCount}
              </span>
            {/if}
            {#if snapshot.diffUrl}{percent(snapshot.diffScore, 1)}{/if}
          </span>
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
    {@const settings = selected.settings}
    <div class="flex-1 min-w-0">
      <div class="flex items-start justify-between mb-4 gap-4">
        <div class="min-w-0">
          <h2 class="text-lg font-semibold truncate">{selected.name}</h2>
          <p class="text-muted-foreground text-sm mt-0.5">
            {#if selected.autoApprovedFromId}
              {percent(selected.diffScore, 3)} of pixels changed · accepted automatically — the same
              image was already approved (e.g. on the branch it was merged from)
            {:else if isChange(selected)}
              {percent(selected.diffScore, 3)} of pixels changed
              {#if selected.reviewedAt}
                · {selected.status === 'approved' ? 'accepted' : 'rejected'}
                by {selected.reviewedBy ?? 'a removed user'} on
                {new Date(selected.reviewedAt).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {/if}
            {:else if selected.status === 'new'}
              First snapshot — used as the baseline
            {:else if (selected.diffScore ?? 0) > 0}
              {percent(selected.diffScore, 3)} of pixels changed — within the threshold, so it counts as unchanged
            {:else if settings.ignoreRegions.length > 0}
              No changes outside the ignored regions
            {:else}
              Identical to the baseline
            {/if}
          </p>
          {#if !editing && (settings.ignoreRegions.length > 0 || settings.threshold > 0)}
            <p class="text-xs text-sky-700 mt-1 flex items-center gap-1">
              <Scan class="h-3.5 w-3.5" />
              {#if settings.ignoreRegions.length > 0}Ignoring {plural(settings.ignoreRegions.length, 'region')}{/if}
              {#if settings.ignoreRegions.length > 0 && settings.threshold > 0} · {/if}
              {#if settings.threshold > 0}Threshold {thresholdLabel(settings.threshold)}{/if}
            </p>
          {/if}
        </div>
        <div class="flex items-center gap-2 shrink-0">
          {#if isChange(selected) && data.canReview && !editing}
            <Button
              variant={selected.status === 'rejected' ? 'destructive' : 'outline'}
              size="sm"
              disabled={busy || selected.status === 'rejected'}
              onclick={() => review(selected, 'rejected')}
              title="Reject (R)"
            >
              <XCircle class="h-4 w-4" />
              {selected.status === 'rejected' ? 'Rejected' : 'Reject'}
            </Button>
            <Button
              size="sm"
              disabled={busy || selected.status === 'approved'}
              onclick={() => review(selected, 'approved')}
              class="bg-green-600 hover:bg-green-700"
              title="Accept (A)"
            >
              <CheckCircle class="h-4 w-4" />
              {selected.status === 'approved' ? 'Accepted' : 'Accept'}
            </Button>
          {:else}
            <Badge variant={STATUS[selected.status].variant}>{STATUS[selected.status].label}</Badge>
          {/if}
        </div>
      </div>

      <!-- Toolbar -->
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div class="flex items-center gap-1" role="group" aria-label="View">
          {#if comparable && !editing}
            {#each VIEWS as v, i (v.mode)}
              <Button
                variant={view === v.mode ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={view === v.mode}
                onclick={() => setView(v.mode)}
                title="{v.label} ({i + 1})"
              >
                <v.icon class="h-4 w-4" />
                {v.label}
              </Button>
            {/each}
          {/if}
        </div>
        <div class="flex items-center gap-1">
          <Button variant="ghost" size="sm" onclick={() => zoomBy(-1)} aria-label="Zoom out (−)"><ZoomOut class="h-4 w-4" /></Button>
          <Button
            variant="ghost"
            size="sm"
            class="w-16 font-mono text-xs"
            onclick={() => (zoom = 'fit')}
            title="Fit (0)"
          >
            {zoom === 'fit' ? 'Fit' : `${zoom * 100}%`}
          </Button>
          <Button variant="ghost" size="sm" onclick={() => zoomBy(1)} aria-label="Zoom in (+)"><ZoomIn class="h-4 w-4" /></Button>
          {#if data.canReview && !editing}
            <Separator orientation="vertical" class="h-5 mx-1" />
            <Button variant="outline" size="sm" onclick={startEditing} title="Ignore regions and threshold (I)">
              <Scan class="h-4 w-4" />
              Ignore regions
            </Button>
          {/if}
        </div>
      </div>

      {#if editing}
        <div class="mb-3 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm">
          <p class="mb-3">
            Drag on the image to mark areas whose changes don't count — dates, animations, ads. Together
            with the threshold they apply to <strong>{selected.name}</strong> in every run of the
            <span class="font-mono">{data.run.suite}</span> suite. Open changes are checked again on save.
          </p>
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex flex-col gap-1">
              <label for="threshold" class="text-xs font-medium">Threshold (% of pixels that may change)</label>
              <Input id="threshold" class="h-8 w-28" inputmode="decimal" bind:value={draftThreshold} />
            </div>
            <span class="text-xs text-muted-foreground pb-2">{plural(draftRegions.length, 'region')}</span>
            {#if draftRegions.length > 0}
              <Button variant="ghost" size="sm" onclick={() => (draftRegions = [])}>Clear regions</Button>
            {/if}
            <div class="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onclick={() => (editing = false)}>Cancel</Button>
              <Button size="sm" onclick={saveSettings} disabled={busy}>Save</Button>
            </div>
          </div>
          {#if settingsError}<p class="mt-2 text-destructive">{settingsError}</p>{/if}
        </div>
      {/if}

      {#key selected.id}
        <ImageCompare
          {mode}
          {zoom}
          name={selected.name}
          before={selected.baselineImageUrl}
          after={selected.imageUrl}
          diff={selected.diffUrl}
          regions={editing ? draftRegions : settings.ignoreRegions}
          {editing}
          onregionschange={(regions) => (draftRegions = regions)}
        />

        <SnapshotComments
          snapshotId={selected.id}
          accessToken={(data as any).accessToken ?? undefined}
          userId={data.user.id}
          canComment={data.canReview}
          canModerate={data.canModerate}
          bind:textarea={commentBox}
          oncountchange={(count) => setCommentCount(selected.id, count)}
        />
      {/key}
    </div>
  {:else}
    <div class="flex-1 flex items-center justify-center py-24 text-muted-foreground">
      <p>Select a snapshot to review</p>
    </div>
  {/if}
</div>

<Dialog bind:open={helpOpen}>
  <DialogContent class="max-w-md">
    <DialogHeader>
      <DialogTitle>Keyboard shortcuts</DialogTitle>
      <DialogDescription>Work through a review without the mouse.</DialogDescription>
    </DialogHeader>
    <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {#each SHORTCUTS as [keys, action] (keys)}
        <dt><kbd class="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{keys}</kbd></dt>
        <dd class="text-muted-foreground">{action}</dd>
      {/each}
    </dl>
  </DialogContent>
</Dialog>
