<script lang="ts">
  import { page } from "$app/state";
  import { currentCourse } from "@tutors/runes";
  import LoContextTree from "@tutors/ui-primitives/components/LoContextTree.svelte";

  const course = $derived(currentCourse.value);
</script>

<div class="min-w-0">
  {#if course}
    {#key page.url.pathname}<LoContextTree lo={course} expandAll={false} />{/key}
  {/if}
</div>
