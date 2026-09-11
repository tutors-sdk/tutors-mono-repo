<script lang="ts">
  import { currentCourse } from "@tutors/runes";
  import LoContextTree from "@tutors/ui-primitives/components/LoContextTree.svelte";

  const course = $derived(currentCourse.value);
</script>

<div class=" max-h-[90vh] overflow-y-auto">
  {#if course}
    <LoContextTree lo={course} expandAll={false} />
  {/if}
</div>
