<script lang="ts">
  import { currentCourse } from "@tutors/runes";
  import LoContextTree from "@tutors/ui-primitives/components/LoContextTree.svelte";
</script>

<div class=" max-h-[90vh] overflow-y-auto">
  <LoContextTree lo={currentCourse?.value} />
</div>
