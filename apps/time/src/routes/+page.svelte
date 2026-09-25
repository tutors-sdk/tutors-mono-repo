<script lang="ts">
  import CourseIdDialog from "$lib/components/CourseIdDialog.svelte";
  import { TutorsTime } from "@tutors/tutors-time-lib";
  import { goto } from "$app/navigation";
  import log from "@tutors/logger";


  let dialogLoading = $state(false);
  let dialogError = $state<string | null>(null);


  async function handleLoadCourse(
    courseId: string,
    startDate: string | null,
    endDate: string | null,
    moodleCourseId: string | null,
    moodleSectionId: string | null
  ) {
    dialogError = null;
    dialogLoading = true;
    try {
      await TutorsTime.loadCourseTime(courseId, startDate, endDate);


      if (moodleCourseId) {
        const response = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId, moodleCourseId, moodleSectionId })
        });
        if (!response.ok) throw new Error("Moodle sync failed. Check the IDs and try again.");
      }


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
    onsubmit={({ courseId, startDate, endDate, moodleCourseId, moodleSectionId }) => handleLoadCourse(courseId, startDate, endDate, moodleCourseId, moodleSectionId)} />
</section>
