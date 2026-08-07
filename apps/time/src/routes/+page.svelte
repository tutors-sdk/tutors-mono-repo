<script lang="ts">
  import CourseIdDialog from "$lib/components/CourseIdDialog.svelte";
  import { TutorsTime } from "@tutors/tutors-time-lib";
  import { goto } from "$app/navigation";

  let dialogOpen = $state(true);
  let dialogLoading = $state(false);
  let dialogError = $state<string | null>(null);
  let courseIdForDialog = $state<string | null>(null);

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
      console.log("Load Dialog@");

      
      if (moodleCourseId) {
        await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId, moodleCourseId, moodleSectionId })
        });
      }

      dialogOpen = false;
      goto(`/${courseId}/medians`);
    } catch (e) {
      dialogError = e instanceof Error ? e.message : "Failed to load calendar data";
    } finally {
      dialogLoading = false;
    }
  }

  function handleCourseIdSubmit(
    event: CustomEvent<{
      courseId: string;
      startDate: string | null;
      endDate: string | null;
      moodleCourseId: string | null;
      moodleSectionId: string | null;
    }>
  ) {
    const { courseId, startDate, endDate, moodleCourseId, moodleSectionId } = event.detail;
    handleLoadCourse(courseId, startDate, endDate, moodleCourseId, moodleSectionId);
  }

  function handleDialogClose() {
    dialogOpen = true;
  }

  function handleDialogOpen(event: CustomEvent<{ open: boolean }>) {
    dialogOpen = event.detail.open;
  }
</script>

<svelte:head>
  <title>Tutors Time</title>
  <meta name="description" content="Calendar visualization for student course time tracking" />
</svelte:head>

<CourseIdDialog
  open={dialogOpen}
  courseId={courseIdForDialog}
  loading={dialogLoading}
  error={dialogError}
  on:submit={handleCourseIdSubmit}
  on:close={handleDialogClose}
  on:open={handleDialogOpen}
/>

<section class="p-2 h-[calc(100vh-4rem)] flex items-center justify-center">
  <p class="text-surface-600">Enter a course ID to load calendar data</p>
</section>
