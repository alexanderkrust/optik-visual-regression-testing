<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils.js';

  let { class: className, children, ...rest }: HTMLAttributes<HTMLTableCellElement> = $props();
</script>

<td
  class={cn(
    'p-4 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
    className
  )}
  {...rest}
>
  {@render children?.()}
</td>
