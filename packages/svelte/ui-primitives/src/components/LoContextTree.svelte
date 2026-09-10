<script lang="ts">
  import type { Lo } from "@tutors/tutors-model-lib";
  import { currentCourse, isEducator, locksLoaded } from "@tutors/runes";
  import LoContextTreeView from "./LoContextTreeView.svelte";

  let { lo, expandAll = true }: { lo: Lo; expandAll?: boolean } = $props();

  let treeReady = $derived(
    isEducator.value || !currentCourse.value?.hasEnrollment || locksLoaded.value,
  );
</script>

{#if treeReady && lo}
  {#key lo.id}
    <LoContextTreeView {lo} {expandAll} />
  {/key}
{/if}
