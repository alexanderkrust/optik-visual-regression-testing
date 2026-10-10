<script lang="ts">
  import { Tabs as TabsPrimitive } from 'bits-ui';
  import { cn } from '$lib/utils';

  let { class: className, children, ...rest } = $props<
    TabsPrimitive.ListProps & { class?: string }
  >();
</script>

<TabsPrimitive.List
  class={cn(
    'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-foreground/70',
    className,
  )}
  {...rest}
>
  {@render children?.()}
</TabsPrimitive.List>
