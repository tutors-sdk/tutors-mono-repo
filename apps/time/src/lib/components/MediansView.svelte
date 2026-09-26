<script lang="ts">
  import type { TutorsTimeCourse } from "@tutors/tutors-time-lib";
  import { BaseLabModel, extractLabIdentifier, extractStepName, formatDateShort } from "@tutors/tutors-time-lib";
  import ActivityTable from "@tutors/ui-components/time/ActivityTable.svelte";
  import Heatmap from "@tutors/ui-components/time/Heatmap.svelte";
  import { t } from "@tutors/i18n";
  import { invalidateAll } from "$app/navigation";

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
  <p role="status">{t("shell.loading")}</p>
{:else if course.error}
  <div class="ui-empty" role="alert">{t("shell.loadError")} <button class="ui-button" onclick={() => invalidateAll()}>{t("shell.retry")}</button></div>
{:else if !medianByWeek && !medianByDay && !medianByLab && !medianByStep}
  <p class="ui-empty">{t("classTime.noMedians")}</p>
{:else}
  {#if dates.length > 0 && (medianByDay || labsMedianByDay)}
    <div class="heatmaps">
      {#if medianByDay}<Heatmap id="medians-calendar-heatmap" title={t("classTime.calendarMedianByDay")} values={medianByDay} {dates} />{/if}
      {#if labsMedianByDay}<Heatmap id="medians-lab-heatmap" title={t("classTime.labMedianByDay")} values={labsMedianByDay} {dates} />{/if}
    </div>
  {/if}
  <ActivityTable title={t("classTime.calendarMedianByWeek")} columns={dated(calModel?.weeks)} rows={[{ label: t("classTime.median"), values: medianByWeek, total: medianByWeek?.totalSeconds, median: true }]} />
  <ActivityTable title={t("classTime.calendarMedianByDay")} columns={dated(dates)} rows={[{ label: t("classTime.median"), values: medianByDay, total: medianByDay?.totalSeconds, median: true }]} />
  <ActivityTable title={t("classTime.labMedianByLab")} columns={(labsModel?.labs ?? []).map((key) => ({ key, label: extractLabIdentifier(key) }))} rows={[{ label: t("classTime.median"), values: medianByLab, total: medianByLab?.totalMinutes, median: true }]} />
  <ActivityTable title={t("classTime.labMedianByStep")} columns={(labsModel?.steps ?? []).map((key) => ({ key, label: extractStepName(key) }))} rows={[{ label: t("classTime.median"), values: medianByStep, total: medianByStep?.totalMinutes, median: true }]} />
{/if}

<style>
  .heatmaps { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-6); }
  @media (max-width: 1023px) { .heatmaps { grid-template-columns: minmax(0, 1fr); } }
</style>
