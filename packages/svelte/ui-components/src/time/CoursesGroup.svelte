<script lang="ts">
  import { liveService } from "@tutors/community";
  import CourseGroup from "./CourseGroup.svelte";
</script>

<div class="course-groups">
  {#each liveService.coursesOnline.value as course}
    <CourseGroup courseId={course.courseId!} courseTitle={course.courseTitle!} />
  {:else}<p class="ui-empty">No courses have shared activity yet.</p>
  {/each}
</div>

<style>
  .course-groups { display: grid; gap: var(--space-4); }
</style>
