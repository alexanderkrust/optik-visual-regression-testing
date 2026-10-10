<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils.js';

  let {
    class: className,
    level = 3,
    children,
    ...rest
  }: HTMLAttributes<HTMLHeadingElement> & { level?: 2 | 3 | 4 } = $props();
</script>

<svelte:element this={`h${level}`} class={cn('font-semibold leading-none tracking-tight', className)} {...rest}>
  {@render children?.()}
</svelte:element>
