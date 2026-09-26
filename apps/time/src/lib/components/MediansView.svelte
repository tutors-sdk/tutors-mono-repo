<script lang="ts">
  import type { TutorsTimeCourse } from "@tutors/tutors-time-lib";
  import { BaseLabModel, extractLabIdentifier, extractStepName, formatDateShort } from "@tutors/tutors-time-lib";
  import ActivityTable from "@tutors/ui-components/time/ActivityTable.svelte";
  import Heatmap from "@tutors/ui-components/time/Heatmap.svelte";

  interface Props {
    course: TutorsTimeCourse | null;
  }

  let { course }: Props = $props();

  const calModel = $derived(course?.calendarModel);
  const labsModel = $derived(course?.labsModel);

  const medianByWeek = $derived(calModel?.medianByWeek?.row ?? null);
  const medianByDay = $derived(calModel?.medianByDay?.row ?? null);
  const medianByLab = $derived(labsModel?.medianByLab?.row ?? null);
  const medianByStep = $derived(labsModel?.medianByLabStep?.row ?? null);

  const dates = $derived(calModel?.dates ?? []);

  const labsMedianByDay = $derived(
    course?.labsMedianByDay ??
      (course?.learningRecords?.length && dates.length
        ? BaseLabModel.buildMedianByDay(course.learningRecords, course.id, dates)
        : null)
  );

  const dated = (keys: string[] = []) => keys.map((key) => ({ key, label: formatDateShort(key) }));
</script>

<svelte:head>
  <title>Medians</title>
  <meta name="description" content="All course medians in one view" />
</svelte:head>

{#if !course}
  <p role="status">Loading course data…</p>
{:else if course.error}
  <p class="ui-empty" role="alert">Error loading course: {course.error}</p>
{:else if !medianByWeek && !medianByDay && !medianByLab && !medianByStep}
  <p class="ui-empty">No median data found for this course.</p>
{:else}
  {#if dates.length > 0 && (medianByDay || labsMedianByDay)}
    <div class="heatmaps">
      {#if medianByDay}<Heatmap id="medians-calendar-heatmap" title="Calendar median by day" values={medianByDay} {dates} />{/if}
      {#if labsMedianByDay}<Heatmap id="medians-lab-heatmap" title="Lab median by day" values={labsMedianByDay} {dates} />{/if}
    </div>
  {/if}
  <ActivityTable title="Calendar median by week" columns={dated(calModel?.weeks)} rows={[{ label: "Median", values: medianByWeek, total: medianByWeek?.totalSeconds, median: true }]} />
  <ActivityTable title="Calendar median by day" columns={dated(dates)} rows={[{ label: "Median", values: medianByDay, total: medianByDay?.totalSeconds, median: true }]} />
  <ActivityTable title="Lab median by lab" columns={(labsModel?.labs ?? []).map((key) => ({ key, label: extractLabIdentifier(key) }))} rows={[{ label: "Median", values: medianByLab, total: medianByLab?.totalMinutes, median: true }]} />
  <ActivityTable title="Lab median by step" columns={(labsModel?.steps ?? []).map((key) => ({ key, label: extractStepName(key) }))} rows={[{ label: "Median", values: medianByStep, total: medianByStep?.totalMinutes, median: true }]} />
{/if}

<style>
  .heatmaps { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-6); }
  @media (max-width: 1023px) { .heatmaps { grid-template-columns: minmax(0, 1fr); } }
</style>
