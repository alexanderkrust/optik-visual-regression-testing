<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui';
  import { cn } from '$lib/utils';

  let { class: className, children, ...rest } = $props<
    SelectPrimitive.ContentProps & { class?: string }
  >();
</script>

<SelectPrimitive.Content
  class={cn(
    'relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md',
    className,
  )}
  sideOffset={4}
  {...rest}
>
  <SelectPrimitive.Viewport class="p-1">
    {@render children?.()}
  </SelectPrimitive.Viewport>
</SelectPrimitive.Content>
