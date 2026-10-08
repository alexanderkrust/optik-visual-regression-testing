<script lang="ts">
  import { Separator } from 'bits-ui';
  import { cn } from '$lib/utils.js';

  let { class: className, orientation = 'horizontal', ...rest }: Separator.RootProps = $props();
</script>

<Separator.Root
  class={cn(
    'bg-border shrink-0',
    orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
    className
  )}
  {orientation}
  {...rest}
/>
