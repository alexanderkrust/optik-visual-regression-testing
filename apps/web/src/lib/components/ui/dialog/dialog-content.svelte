<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { cn } from '$lib/utils.js';
  import DialogOverlay from './dialog-overlay.svelte';

  let { class: className, children, ...rest }: Dialog.ContentProps = $props();
</script>

<Dialog.Portal>
  <DialogOverlay />
  <Dialog.Content
    class={cn(
      'bg-background fixed left-[50%] top-[50%] z-50 grid w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
      className
    )}
    {...rest}
  >
    {@render children?.()}
  </Dialog.Content>
</Dialog.Portal>
