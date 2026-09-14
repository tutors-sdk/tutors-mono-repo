<script lang="ts">
  import type { Lo } from "@tutors/tutors-model-lib";
  import { contentLocks, currentCourse, isEducator, locksLoaded } from "@tutors/runes";
  import { rbacService } from "@tutors/rbac";
  import LoContextTreeView from "./LoContextTreeView.svelte";

  let { lo, expandAll = false }: { lo: Lo; expandAll?: boolean } = $props();

  $effect(() => {
    const course = currentCourse.value;
    if (course?.hasEnrollment && course.courseId && !locksLoaded.value) {
      void rbacService.loadContentLocks(course.courseId);
    }
  });

  const showTree = $derived(
    isEducator.value || !currentCourse.value?.hasEnrollment || locksLoaded.value,
  );

  let lockFingerprint = $derived(
    isEducator.value || !currentCourse.value?.hasEnrollment
      ? "all"
      : `${locksLoaded.value}:${[...contentLocks.value.entries()]
          .filter(([, locked]) => locked)
          .map(([route]) => route)
          .sort()
          .join("\0")}`,
  );
</script>

{#if lo && showTree}
  {#key lockFingerprint}
    <LoContextTreeView {lo} {expandAll} />
  {/key}
{/if}
