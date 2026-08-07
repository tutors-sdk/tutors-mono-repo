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
      error = course?.error ?? null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load calendar data";
    } finally {
      loading = false;
    }
  });

  const data = $derived(course?.data ?? []);

  function formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return dateString;
    }
  }

  // timeactive is already in minutes (converted at load)
  function formatTime(minutes: number): string {
    return `${Math.round(minutes)}`;
  }
</script>

{#if loading}
  <div class="flex items-center justify-center p-8">
    <p class="text-lg">Loading calendar data...</p>
  </div>
{:else if error}
  <div class="card preset-filled-error-500 p-4">
    <p class="font-bold">Error loading data</p>
    <p class="text-sm">{error}</p>
  </div>
{:else if data.length === 0}
  <div class="flex items-center justify-center p-8">
    <p class="text-lg text-surface-600">No calendar data available</p>
  </div>
{:else}
  <!-- Table -->
  <div class="table-wrap overflow-x-auto">
    <table class="table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Student ID</th>
          <th>Course ID</th>
          <th class="text-right">Time Active (minutes)</th>
          <th class="text-right">Page Loads</th>
        </tr>
      </thead>
      <tbody>
        {#each data as entry (entry.id + entry.studentid + entry.courseid)}
          <tr>
            <td>{formatDate(entry.id)}</td>
            <td>{entry.studentid}</td>
            <td>{entry.courseid}</td>
            <td class="text-right">{formatTime(entry.timeactive)}</td>
            <td class="text-right">{entry.pageloads}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="mt-4 text-sm text-surface-600">
    Showing {data.length} calendar {data.length === 1 ? "entry" : "entries"}
  </p>
{/if}
