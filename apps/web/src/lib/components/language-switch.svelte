<script lang="ts">
  import { page } from '$app/state';
  import { LOCALES, useI18n } from '$lib/i18n';

  let { class: className = '' }: { class?: string } = $props();
  const { locale, m } = useI18n();
</script>

<!-- A plain form: the page reloads in the new language -->
<form method="POST" action="/locale" class={className}>
  <input type="hidden" name="redirectTo" value={page.url.pathname + page.url.search} />
  <select
    name="locale"
    aria-label={m.nav.language}
    class="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    onchange={(e) => e.currentTarget.form?.requestSubmit()}
  >
    {#each LOCALES as option (option.value)}
      <option value={option.value} lang={option.value} selected={option.value === locale}>{option.label}</option>
    {/each}
  </select>
</form>
