<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils.js';

  let { class: className, children, ...rest }: HTMLAttributes<HTMLTableCellElement> = $props();
</script>

<th
  class={cn(
    'text-muted-foreground h-10 px-4 text-left align-middle font-medium [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
    className
  )}
  {...rest}
>
  {@render children?.()}
</th>
