<script lang="ts">
  import type { TutorsTimeStudent } from "@tutors/tutors-time-lib";
  import { t } from "@tutors/i18n";
  import Heatmap from "./Heatmap.svelte";

  let { studentCalendar }: { studentCalendar: TutorsTimeStudent } = $props();
  const dates = $derived(studentCalendar.course?.dates ?? []);
  // Each of the student's maps sits beside the matching course median so the two read as a pair.
  const maps = $derived([
    { id: "student-activity-heatmap", title: t("time.calendarActivity"), values: studentCalendar.calendarByDay },
    { id: "course-median-heatmap", title: t("time.calendarMedian"), values: studentCalendar.course?.calendarModel?.medianByDay?.row },
    { id: "student-lab-heatmap", title: t("time.labActivity"), values: studentCalendar.labsByDay },
    { id: "lab-median-heatmap", title: t("time.labMedian"), values: studentCalendar.course?.labsMedianByDay }
  ].filter(map => map.values));
</script>

{#if dates.length && maps.length}
  <div class="heatmaps">
    {#each maps as map}<Heatmap id={map.id} title={map.title} values={map.values!} {dates} />{/each}
  </div>
{/if}

<style>
  .heatmaps { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-6); }
  @media (max-width: 1023px) { .heatmaps { grid-template-columns: minmax(0, 1fr); } }
</style>
