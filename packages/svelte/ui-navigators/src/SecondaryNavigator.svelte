<script lang="ts">
  import Breadcrumbs from "./buttons/Breadcrumbs.svelte";
  let { lo, parentCourse = null } = $props();
</script>
<div class="secondary-navigation"><Breadcrumbs {lo} {parentCourse} /></div>
<style>
  .secondary-navigation { padding: var(--space-6) var(--space-10) 0; margin-bottom: var(--space-4); }
  @media (max-width: 767px) { .secondary-navigation { padding: var(--space-5) var(--space-4) 0; } }
</style>
