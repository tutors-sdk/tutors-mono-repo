<script lang="ts">
  import type { Lo } from "@tutors/tutors-model-lib";
  import type { Snippet } from "svelte";
  import SecondaryNavigator from "@tutors/ui-navigators/SecondaryNavigator.svelte";
  let { children, lo }: { children: Snippet; lo: Lo } = $props();
</script>
<SecondaryNavigator {lo} parentCourse={lo?.parentCourse?.properties?.parent} />
<div class="reader-content">
  <!-- No heading here: the side menu's card names the resource, pictures it and summarises it (#399),
       so repeating the title at the top of the canvas only pushed the content down. -->
  {@render children()}
</div>
<style>
  .reader-content { padding-top: 0; }
</style>
