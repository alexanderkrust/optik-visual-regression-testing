<script lang="ts">
  import '../../app.css';
  import type { Snippet } from 'svelte';
  import { provideI18n } from '$lib/i18n';
  import type { LayoutData } from './$types';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();
  provideI18n(() => data.locale);
</script>

<main>
  {@render children()}
</main>
