<script lang="ts">
  import CourseIdDialog from "$lib/components/CourseIdDialog.svelte";
  import { TutorsTime } from "@tutors/tutors-time-lib";
  import { goto } from "$app/navigation";


  let dialogLoading = $state(false);
  let dialogError = $state<string | null>(null);


  async function handleLoadCourse(
    courseId: string,
    startDate: string | null,
    endDate: string | null
  ) {
    dialogError = null;
    dialogLoading = true;
    try {
      await TutorsTime.loadCourseTime(courseId, startDate, endDate);


      goto(`/${courseId}/medians`);
    } catch (e) {
      dialogError = e instanceof Error ? e.message : "Failed to load calendar data";
    } finally {
      dialogLoading = false;
    }
  }

</script>

<svelte:head>
  <title>Tutors Time</title>
  <meta name="description" content="Calendar visualization for student course time tracking" />
</svelte:head>

<section class="ui-page">
  <CourseIdDialog loading={dialogLoading} error={dialogError}
    onsubmit={({ courseId, startDate, endDate }) => handleLoadCourse(courseId, startDate, endDate)} />
</section>
