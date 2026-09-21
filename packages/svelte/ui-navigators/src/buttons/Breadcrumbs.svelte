<script lang="ts">
  import type { Lo } from "@tutors/tutors-model-lib";
  import { t } from "@tutors/i18n";
  let { lo, parentCourse = null } = $props();
  const crumbs: Lo[] = $derived(lo?.breadCrumbs ?? []);
</script>
<nav aria-label={t("a11y.breadcrumbs")}>
  <ol class="breadcrumbs">
    <li><a href="/">{t("shell.myCourses")}</a></li>
    {#if parentCourse}<li aria-hidden="true">/</li><li><a href={`/${parentCourse}`}>{t("shell.parentCourse")}</a></li>{/if}
    {#each crumbs as crumb, i}
      <li aria-hidden="true">/</li>
      <li>{#if i === crumbs.length - 1}<span aria-current="page">{crumb.title}</span>{:else}<a href={crumb.route}>{crumb.title}</a>{/if}</li>
    {/each}
  </ol>
</nav>
<style>
  .breadcrumbs { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; font-size: var(--font-label); color: var(--ui-muted); }
  li { min-width: 0; overflow-wrap: anywhere; }
  a { color: var(--ui-brand); }
</style>
