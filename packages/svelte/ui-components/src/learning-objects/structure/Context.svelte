<script lang="ts">
  import type { Lo } from "@tutors/tutors-model-lib";
  import type { Snippet } from "svelte";
  import SecondaryNavigator from "@tutors/ui-navigators/SecondaryNavigator.svelte";
  import Image from "@tutors/ui-primitives/components/Image.svelte";
  let { children, lo }: { children: Snippet; lo: Lo } = $props();
</script>
<SecondaryNavigator {lo} parentCourse={lo?.parentCourse?.properties?.parent} />
<div class="reader-content">
  {#if lo.type !== "lab"}
    <header class="reader-heading"><Image {lo} miniImage /><div><p class="ui-eyebrow">{lo.type}</p><h1 class="ui-title">{lo.title}</h1></div></header>
  {/if}
  {@render children()}
</div>
<style>
  .reader-content { padding-top: 0; }
  .reader-heading { display: flex; align-items: center; gap: var(--space-4); margin-bottom: var(--space-6); }
</style>
