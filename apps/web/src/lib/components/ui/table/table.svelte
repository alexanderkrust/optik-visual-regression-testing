<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils.js';

  let { class: className, children, ...rest }: HTMLAttributes<HTMLTableElement> = $props();
</script>

<!-- Focusable, so wide tables can be scrolled with the keyboard -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="relative w-full overflow-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" tabindex="0">
  <table class={cn('w-full caption-bottom text-sm', className)} {...rest}>
    {@render children?.()}
  </table>
</div>
