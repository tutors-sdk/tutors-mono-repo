<script lang="ts">
  import BookmarkButton from "./buttons/BookmarkButton.svelte";
  import Breadcrumbs from "./buttons/Breadcrumbs.svelte";
  const { lo, parentCourse = null } = $props();
</script>
<div class="secondary-navigation"><Breadcrumbs {lo} {parentCourse} /><BookmarkButton {lo} /></div>
<style>
  .secondary-navigation { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-4) var(--space-10); }
  /* Keep the breadcrumb row compact while aligning it with the page gutters. */
  @media (min-width: 768px) and (max-width: 1023px) { .secondary-navigation { padding-inline: var(--space-6); } }
  @media (max-width: 767px) { .secondary-navigation { padding-inline: var(--space-4); } }
</style>
