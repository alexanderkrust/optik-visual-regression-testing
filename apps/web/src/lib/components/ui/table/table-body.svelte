<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils.js';

  let { class: className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement> = $props();
</script>

<tbody class={cn('[&_tr:last-child]:border-0', className)} {...rest}>
  {@render children?.()}
</tbody>
