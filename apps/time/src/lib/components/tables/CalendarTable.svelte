<script lang="ts">
  import { TutorsTime } from "@tutors/tutors-time-lib";
  import type { TutorsTimeCourse } from "@tutors/tutors-time-lib";
  import { onMount } from "svelte";
  import { locale, t } from "@tutors/i18n";
  import log from "@tutors/logger";

  let { courseId }: { courseId: string } = $props();

  let course = $state<TutorsTimeCourse | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function load() {
    loading = true;
    error = null;
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
  }

  onMount(load);

  const data = $derived(course?.data ?? []);

  function formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(locale.value, { year: "numeric", month: "short", day: "numeric" });
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
  <p role="status">{t("shell.loading")}</p>
{:else if error}
  <div class="ui-empty" role="alert">{t("shell.loadError")} <button class="ui-button" onclick={load}>{t("shell.retry")}</button></div>
{:else if data.length === 0}
  <p class="ui-empty">{t("classTime.noCalendar")}</p>
{:else}
  <section class="ui-panel">
  <div class="table-wrap overflow-x-auto">
    <table class="table">
      <thead>
        <tr>
          <th>{t("classTime.date")}</th>
          <th>{t("classTime.studentId")}</th>
          <th>{t("classTime.courseId")}</th>
          <th class="text-right">{t("classTime.timeActiveMinutes")}</th>
          <th class="text-right">{t("classTime.pageLoads")}</th>
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
  <p class="ui-muted mt-4 text-sm">{t("classTime.calendarEntries")}: {data.length}</p>
  </section>
{/if}
