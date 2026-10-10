<script lang="ts" module>
  export type CompareMode = 'side' | 'slider' | 'onion' | 'diff' | 'single';
  /** 'fit' scales large images down to the available width; numbers are a fixed zoom. */
  export type Zoom = 'fit' | number;
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { IgnoreRegion } from '@optik/shared';

  type Size = { w: number; h: number };

  let {
    mode,
    before = null,
    after,
    diff = null,
    zoom,
    regions = [],
    editing = false,
    onregionschange,
    name,
  }: {
    mode: CompareMode;
    /** Baseline image */
    before?: string | null;
    /** This run's image */
    after: string;
    diff?: string | null;
    zoom: Zoom;
    regions?: IgnoreRegion[];
    /** Draw and remove ignore regions on the image (shown in "single" mode) */
    editing?: boolean;
    onregionschange?: (regions: IgnoreRegion[]) => void;
    name: string;
  } = $props();

  let width = $state(0);
  let sizes = $state<Record<'before' | 'after' | 'diff', Size | null>>({
    before: null,
    after: null,
    diff: null,
  });
  let split = $state(50);
  let opacity = $state(50);
  let draft = $state<IgnoreRegion | null>(null);

  const GAP = 16;

  const shown = $derived(
    mode === 'diff'
      ? [sizes.diff]
      : mode === 'single'
        ? [sizes.after]
        : [sizes.before, sizes.after],
  );
  const canvas = $derived({
    w: Math.max(0, ...shown.map((s) => s?.w ?? 0)),
    h: Math.max(0, ...shown.map((s) => s?.h ?? 0)),
  });
  const available = $derived(mode === 'side' ? (width - GAP) / 2 : width);
  const scale = $derived(
    zoom === 'fit' ? (canvas.w > 0 && available > 0 ? Math.min(1, available / canvas.w) : 1) : zoom,
  );

  /** Measures an image once it has loaded (also when it was cached before hydration). */
  function measure(key: keyof typeof sizes) {
    return (img: HTMLImageElement) => {
      const set = () => {
        if (img.naturalWidth) sizes[key] = { w: img.naturalWidth, h: img.naturalHeight };
      };
      if (img.complete) set();
      img.addEventListener('load', set);
      return () => img.removeEventListener('load', set);
    };
  }

  // Side by side: both panes scroll together
  let panes: HTMLDivElement[] = $state([]);
  function syncScroll(from: HTMLDivElement) {
    for (const pane of panes) {
      if (pane && pane !== from) {
        pane.scrollLeft = from.scrollLeft;
        pane.scrollTop = from.scrollTop;
      }
    }
  }

  // ── Slider ────────────────────────────────────────────────────────────────
  let sliding = false;
  function slide(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    split = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
  }

  // ── Ignore regions ────────────────────────────────────────────────────────
  let origin: { x: number; y: number } | null = null;
  function point(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clamp = (v: number, max: number) => Math.round(Math.min(max, Math.max(0, v)));
    return {
      x: clamp((e.clientX - rect.left) / scale, canvas.w),
      y: clamp((e.clientY - rect.top) / scale, canvas.h),
    };
  }
  function startDraw(e: PointerEvent) {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    origin = point(e);
    draft = { ...origin, width: 0, height: 0 };
  }
  function moveDraw(e: PointerEvent) {
    if (!origin) return;
    const p = point(e);
    draft = {
      x: Math.min(origin.x, p.x),
      y: Math.min(origin.y, p.y),
      width: Math.abs(p.x - origin.x),
      height: Math.abs(p.y - origin.y),
    };
  }
  function endDraw() {
    if (draft && draft.width >= 2 && draft.height >= 2) onregionschange?.([...regions, draft]);
    origin = null;
    draft = null;
  }
  const removeRegion = (index: number) => onregionschange?.(regions.filter((_, i) => i !== index));

  const px = (v: number) => `${v * scale}px`;
</script>

{#snippet image(src: string, key: keyof typeof sizes, alt: string, style = '')}
  <img
    {src}
    {alt}
    draggable="false"
    {@attach measure(key)}
    class="absolute left-0 top-0 max-w-none select-none"
    class:pixelated={scale >= 2}
    style="width: {sizes[key] ? px(sizes[key].w) : 'auto'}; {style}"
  />
{/snippet}

{#snippet overlay(editable: boolean)}
  {#if editable}
    <div
      class="absolute inset-0 cursor-crosshair touch-none"
      role="presentation"
      onpointerdown={startDraw}
      onpointermove={moveDraw}
      onpointerup={endDraw}
      onpointercancel={endDraw}
    ></div>
  {/if}
  {#each regions as region, i (i)}
    <div
      class="region pointer-events-none absolute"
      style="left: {px(region.x)}; top: {px(region.y)}; width: {px(region.width)}; height: {px(region.height)}"
    >
      {#if editable}
        <button
          type="button"
          class="pointer-events-auto absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-xs leading-none text-white shadow hover:bg-sky-700"
          aria-label="Remove ignore region {i + 1}"
          onclick={() => removeRegion(i)}>×</button
        >
      {/if}
    </div>
  {/each}
  {#if draft}
    <div
      class="region pointer-events-none absolute"
      style="left: {px(draft.x)}; top: {px(draft.y)}; width: {px(draft.width)}; height: {px(draft.height)}"
    ></div>
  {/if}
{/snippet}

{#snippet stage(content: Snippet, label: string | null, paneIndex = 0)}
  <div class="min-w-0 flex-1">
    {#if label}
      <p class="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
    {/if}
    <!-- Focusable, so zoomed images can be scrolled with the keyboard -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="checker max-h-[75vh] overflow-auto rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      bind:this={panes[paneIndex]}
      role="region"
      aria-label={label ?? name}
      tabindex="0"
      onscroll={(e) => mode === 'side' && syncScroll(e.currentTarget)}
    >
      <div class="relative" style="width: {px(canvas.w)}; height: {px(canvas.h)}">
        {@render content()}
      </div>
    </div>
  </div>
{/snippet}

<div bind:clientWidth={width} class="w-full">
  {#if mode === 'side' && before}
    <div class="flex gap-4">
      {#snippet beforePane()}
        {@render image(before!, 'before', `${name} — baseline`)}
        {@render overlay(false)}
      {/snippet}
      {#snippet afterPane()}
        {@render image(after, 'after', `${name} — this run`)}
        {@render overlay(false)}
      {/snippet}
      {@render stage(beforePane, 'Before (baseline)', 0)}
      {@render stage(afterPane, 'After (this run)', 1)}
    </div>
  {:else if mode === 'slider' && before}
    {#snippet sliderPane()}
      {@render image(after, 'after', `${name} — this run`)}
      {@render image(before!, 'before', `${name} — baseline`, `clip-path: inset(0 ${100 - split}% 0 0)`)}
      <div
        class="absolute inset-0 cursor-ew-resize touch-none"
        role="slider"
        tabindex="0"
        aria-label="Before / after divider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split)}
        aria-valuetext="{Math.round(split)}% before"
        onkeydown={(e) => {
          const step = e.shiftKey ? 20 : 5;
          if (e.key === 'ArrowLeft') split = Math.max(0, split - step);
          else if (e.key === 'ArrowRight') split = Math.min(100, split + step);
          else if (e.key === 'Home') split = 0;
          else if (e.key === 'End') split = 100;
          else return;
          // Keep the page's arrow shortcuts from also firing
          e.preventDefault();
          e.stopPropagation();
        }}
        onpointerdown={(e) => {
          sliding = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          slide(e);
        }}
        onpointermove={(e) => sliding && slide(e)}
        onpointerup={() => (sliding = false)}
      ></div>
      <div class="pointer-events-none absolute inset-y-0 w-0.5 bg-primary shadow" style="left: {split}%">
        <span
          class="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background"
        ></span>
      </div>
      {@render overlay(false)}
    {/snippet}
    <div class="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
      <span>← Before</span>
      <span>After →</span>
    </div>
    {@render stage(sliderPane, null)}
  {:else if mode === 'onion' && before}
    {#snippet onionPane()}
      {@render image(before!, 'before', `${name} — baseline`)}
      {@render image(after, 'after', `${name} — this run`, `opacity: ${opacity / 100}`)}
      {@render overlay(false)}
    {/snippet}
    <label class="mb-2 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
      Before
      <input type="range" min="0" max="100" bind:value={opacity} class="w-48 accent-primary" aria-label="Opacity of this run's image" />
      After
    </label>
    {@render stage(onionPane, null)}
  {:else if mode === 'diff' && diff}
    {#snippet diffPane()}
      {@render image(diff!, 'diff', `${name} — diff`)}
      {@render overlay(false)}
    {/snippet}
    {@render stage(diffPane, null)}
  {:else}
    {#snippet singlePane()}
      {@render image(after, 'after', name)}
      {@render overlay(editing)}
    {/snippet}
    {@render stage(singlePane, null)}
  {/if}
</div>

<style>
  .checker {
    background-color: var(--background);
    background-image:
      linear-gradient(45deg, var(--muted) 25%, transparent 25%),
      linear-gradient(-45deg, var(--muted) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--muted) 75%),
      linear-gradient(-45deg, transparent 75%, var(--muted) 75%);
    background-size: 16px 16px;
    background-position:
      0 0,
      0 8px,
      8px -8px,
      -8px 0;
  }
  .pixelated {
    image-rendering: pixelated;
  }
  .region {
    border: 2px dashed rgb(14 165 233);
    background: rgb(56 189 248 / 0.2);
  }
</style>
