<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { cn } from '$lib/utils.js';

  let { class: className, children, ...rest }: Dialog.DescriptionProps = $props();
</script>

<Dialog.Description class={cn('text-muted-foreground text-sm', className)} {...rest}>
  {@render children?.()}
</Dialog.Description>
