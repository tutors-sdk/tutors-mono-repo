<script lang="ts">
  import { liveService, LoRecord } from "@tutors/community";
  import CourseGroupHeader from "./CourseGroupHeader.svelte";
  import StudentCard from "@tutors/ui-primitives/components/StudentCard.svelte";

  let { courseId, courseTitle } = $props<{ courseId: string; courseTitle: string }>();

  let students = $derived(liveService.studentsOnline.value.filter((lo: LoRecord) => lo.courseId === courseId && lo?.user?.fullName !== "Anon"));
</script>

<section class="ui-panel">
  <CourseGroupHeader {courseId} {courseTitle} />
  <div class="ui-grid card-grid">
    {#each students as lo}
      <div class="min-w-0"><StudentCard {lo} /></div>
    {/each}
  </div>
</section>
