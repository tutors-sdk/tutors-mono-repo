<script lang="ts">
  import { liveService, LoRecord } from "@tutors/community";
  import CourseGroupHeader from "./CourseGroupHeader.svelte";
  import StudentCard from "@tutors/ui-primitives/components/StudentCard.svelte";

  let { courseId, courseTitle } = $props<{ courseId: string; courseTitle: string }>();

  let students = $derived(liveService.studentsOnline.value.filter((lo: LoRecord) => lo.courseId === courseId));
</script>

<div class="ui-panel mb-4 w-full">
  <CourseGroupHeader {courseId} {courseTitle} />
  <div class="ui-grid">
    {#each students as lo}
      {#if lo?.user?.fullName !== "Anon"}
        <StudentCard
          {lo}
          cardLayout={{
            layout: "expanded",
            style: "landscape"
          }}
        />
      {/if}
    {/each}
  </div>
</div>
