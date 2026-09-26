<script lang="ts">
  import { TutorsTime } from "@tutors/tutors-time-lib";
  import type { TutorsTimeCourse } from "@tutors/tutors-time-lib";
  import { onMount } from "svelte";
  import log from "@tutors/logger";

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
      log.error("CalendarTable failed to load:", e);
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
  <p role="status">Loading calendar data…</p>
{:else if error}
  <p class="ui-empty" role="alert">Error loading data: {error}</p>
{:else if data.length === 0}
  <p class="ui-empty">No calendar data available.</p>
{:else}
  <section class="ui-panel">
  <div class="table-wrap overflow-x-auto">
    <table class="table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Student ID</th>
          <th>Course ID</th>
          <th class="text-right">Time active (minutes)</th>
          <th class="text-right">Page loads</th>
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
  <p class="mt-4 text-sm text-[var(--ui-muted)]">
    Showing {data.length} calendar {data.length === 1 ? "entry" : "entries"}
  </p>
  </section>
{/if}
