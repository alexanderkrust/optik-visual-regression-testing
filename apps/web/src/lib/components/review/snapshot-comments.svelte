<script lang="ts">
  import { MessageSquare, Trash2 } from 'lucide-svelte';
  import type { SnapshotComment } from '@optik/shared';
  import { Button } from '$lib/components/ui/button';
  import { createApi } from '$lib/api';

  let {
    snapshotId,
    accessToken,
    userId,
    canComment,
    canModerate,
    oncountchange,
    textarea = $bindable(),
  }: {
    snapshotId: string;
    accessToken?: string;
    userId: string;
    /** Reviewers and up */
    canComment: boolean;
    /** Maintainers may delete everyone's comments */
    canModerate: boolean;
    oncountchange?: (count: number) => void;
    textarea?: HTMLTextAreaElement;
  } = $props();

  const api = $derived(createApi(accessToken));

  let comments = $state<SnapshotComment[]>([]);
  let loading = $state(true);
  let body = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    const id = snapshotId;
    loading = true;
    error = null;
    api.snapshots
      .comments(id)
      .then((list) => {
        if (id === snapshotId) comments = list;
      })
      .catch((e) => (error = e.message))
      .finally(() => (loading = false));
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    busy = true;
    error = null;
    try {
      comments = [...comments, await api.snapshots.comment(snapshotId, body)];
      body = '';
      oncountchange?.(comments.length);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  async function remove(comment: SnapshotComment) {
    if (!confirm('Delete this comment?')) return;
    try {
      await api.snapshots.deleteComment(snapshotId, comment.id);
      comments = comments.filter((c) => c.id !== comment.id);
      oncountchange?.(comments.length);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<section class="mt-6">
  <h3 class="mb-3 flex items-center gap-2 text-sm font-semibold">
    <MessageSquare class="h-4 w-4" /> Comments
    {#if comments.length > 0}<span class="font-normal text-muted-foreground">{comments.length}</span>{/if}
  </h3>

  {#if loading && comments.length === 0}
    <p class="text-sm text-muted-foreground">Loading…</p>
  {:else if comments.length === 0}
    <p class="text-sm text-muted-foreground">No comments yet.</p>
  {:else}
    <ul class="space-y-3">
      {#each comments as comment (comment.id)}
        <li class="group rounded-md border bg-muted/30 px-3 py-2">
          <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              <span class="font-medium text-foreground">{comment.author ?? 'a removed user'}</span>
              · {when(comment.createdAt)}
            </span>
            {#if comment.authorId === userId || canModerate}
              <button
                type="button"
                class="opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                aria-label="Delete comment"
                onclick={() => remove(comment)}
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            {/if}
          </div>
          <p class="mt-1 whitespace-pre-wrap break-words text-sm">{comment.body}</p>
        </li>
      {/each}
    </ul>
  {/if}

  {#if canComment}
    <form class="mt-3 space-y-2" onsubmit={submit}>
      <textarea
        bind:this={textarea}
        bind:value={body}
        rows="2"
        maxlength="5000"
        placeholder="Add a comment… (Ctrl+Enter to send)"
        aria-label="Comment"
        class="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onkeydown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
          if (e.key === 'Escape') e.currentTarget.blur();
        }}
      ></textarea>
      <Button type="submit" size="sm" variant="outline" disabled={busy || !body.trim()}>Comment</Button>
    </form>
  {/if}
  {#if error}<p class="mt-2 text-sm text-destructive">{error}</p>{/if}
</section>
