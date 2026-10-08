<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils.js';

  let { class: className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement> = $props();
</script>

<thead class={cn('[&_tr]:border-b', className)} {...rest}>
  {@render children?.()}
</thead>
