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
      error = course?.learningRecordsError ?? null;
    } catch (e) {
      log.error("LearningRecordsTable failed to load:", e);
      error = e instanceof Error ? e.message : "Failed to load learning records";
    } finally {
      loading = false;
    }
  }

  onMount(load);

  const data = $derived(course?.learningRecords ?? []);

  function formatDate(dateString: string | null): string {
    if (!dateString) return t("classTime.notAvailable");
    try {
      const date = new Date(dateString);
      return (
        date.toLocaleDateString(locale.value, { year: "numeric", month: "short", day: "numeric" }) +
        " " +
        date.toLocaleTimeString(locale.value, { hour: "2-digit", minute: "2-digit" })
      );
    } catch {
      return dateString;
    }
  }

  // duration is already in minutes (converted at load)
  function formatDuration(minutes: number | null): string {
    if (minutes === null) return t("classTime.notAvailable");
    return `${Math.round(minutes)}`;
  }
</script>

{#if loading}
  <p role="status">{t("shell.loading")}</p>
{:else if error}
  <div class="ui-empty" role="alert">{t("shell.loadError")} <button class="ui-button" onclick={load}>{t("shell.retry")}</button></div>
{:else if data.length === 0}
  <p class="ui-empty">{t("classTime.noLearningRecords")}</p>
{:else}
  <section class="ui-panel">
  <div class="table-wrap overflow-x-auto">
    <table class="table">
      <thead>
        <tr>
          <th>{t("classTime.studentId")}</th>
          <th>{t("classTime.learningObjectId")}</th>
          <th>{t("content.type")}</th>
          <th class="text-right">{t("classTime.durationMinutes")}</th>
          <th class="text-right">{t("classTime.count")}</th>
          <th>{t("classTime.lastAccessed")}</th>
        </tr>
      </thead>
      <tbody>
        {#each data as record (record.course_id + record.student_id + (record.lo_id || "") + (record.type || ""))}
          <tr>
            <td>{record.student_id}</td>
            <td>{record.lo_id || t("classTime.notAvailable")}</td>
            <td>{record.type || t("classTime.notAvailable")}</td>
            <td class="text-right">{formatDuration(record.duration)}</td>
            <td class="text-right">{record.count ?? t("classTime.notAvailable")}</td>
            <td>{formatDate(record.date_last_accessed)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="ui-muted mt-4 text-sm">{t("classTime.learningRecords")}: {data.length}</p>
  </section>
{/if}
