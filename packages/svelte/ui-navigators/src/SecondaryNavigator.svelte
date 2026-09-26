<script lang="ts">
  import Breadcrumbs from "./buttons/Breadcrumbs.svelte";
  let { lo, parentCourse = null, home = null } = $props();
</script>
<div class="secondary-navigation"><Breadcrumbs {lo} {parentCourse} {home} /></div>
<style>
  .secondary-navigation { padding: var(--space-4) var(--space-10); }
  /* Keep the breadcrumb row compact while aligning it with the page gutters. */
  @media (min-width: 768px) and (max-width: 1023px) { .secondary-navigation { padding-inline: var(--space-6); } }
  @media (max-width: 767px) { .secondary-navigation { padding-inline: var(--space-4); } }
</style>
