<script lang="ts">
  import { TutorsTime } from "@tutors/tutors-time-lib";
  import type { TutorsTimeCourse } from "@tutors/tutors-time-lib";
  import { onMount } from "svelte";

  let { courseId }: { courseId: string } = $props();

  let course = $state<TutorsTimeCourse | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    const id = courseId.trim();
    if (!id) {
      error = "Course ID is required.";
      loading = false;
      return;
    }
    try {
      const courseTime = await TutorsTime.loadCourseTime(id);
      course = courseTime;
      error = course?.learningRecordsError ?? null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load learning records";
    } finally {
      loading = false;
    }
  });

  const data = $derived(course?.learningRecords ?? []);

  function formatDate(dateString: string | null): string {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return (
        date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) +
        " " +
        date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      );
    } catch {
      return dateString;
    }
  }

  // duration is already in minutes (converted at load)
  function formatDuration(minutes: number | null): string {
    if (minutes === null) return "N/A";
    return `${Math.round(minutes)}`;
  }
</script>

{#if loading}
  <div class="flex items-center justify-center p-8">
    <p class="text-lg">Loading learning records...</p>
  </div>
{:else if error}
  <div class="card preset-filled-error-500 p-4">
    <p class="font-bold">Error loading data</p>
    <p class="text-sm">{error}</p>
  </div>
{:else if data.length === 0}
  <div class="flex items-center justify-center p-8">
    <p class="text-lg text-surface-600">No learning records available</p>
  </div>
{:else}
  <!-- Table -->
  <div class="table-wrap overflow-x-auto">
    <table class="table">
      <thead>
        <tr>
          <th>Student ID</th>
          <th>Learning Object ID</th>
          <th>Type</th>
          <th class="text-right">Duration (minutes)</th>
          <th class="text-right">Count</th>
          <th>Last Accessed</th>
        </tr>
      </thead>
      <tbody>
        {#each data as record (record.course_id + record.student_id + (record.lo_id || "") + (record.type || ""))}
          <tr>
            <td>{record.student_id}</td>
            <td>{record.lo_id || "N/A"}</td>
            <td>{record.type || "N/A"}</td>
            <td class="text-right">{formatDuration(record.duration)}</td>
            <td class="text-right">{record.count ?? "N/A"}</td>
            <td>{formatDate(record.date_last_accessed)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="mt-4 text-sm text-surface-600">
    Showing {data.length} learning {data.length === 1 ? "record" : "records"}
  </p>
{/if}
