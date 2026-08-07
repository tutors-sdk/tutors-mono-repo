<script lang="ts">
  import type { TutorsTimeCourse } from "@tutors/tutors-time-lib";
  import { BaseLabModel } from "@tutors/tutors-time-lib";
  import {
    formatDateShort,
    formatTimeMinutesOnly,
    cellColorForMinutes,
    extractLabIdentifier,
    extractStepName
  } from "@tutors/tutors-time-lib";
  import CalendarHeatmap from "$lib/components/calendar/CalendarHeatmap.svelte";

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

  const weeks = $derived(calModel?.weeks ?? []);
  const dates = $derived(calModel?.dates ?? []);
  const labs = $derived(labsModel?.labs ?? []);
  const steps = $derived(labsModel?.steps ?? []);

  /** Lab median by day – build from learning records when not on course (e.g. medians view) */
  const labsMedianByDay = $derived(
    course?.labsMedianByDay ??
      (course?.learningRecords?.length && dates.length
        ? BaseLabModel.buildMedianByDay(course.learningRecords, course.id, dates)
        : null)
  );

  function formatTime(minutes: number | undefined): string {
    if (minutes == null || minutes === 0) return "—";
    return formatTimeMinutesOnly(minutes);
  }
</script>

<svelte:head>
  <title>Medians</title>
  <meta name="description" content="All course medians in one view" />
</svelte:head>

<section class="p-2 space-y-6">
  {#if !course}
    <div class="flex items-center justify-center p-8">
      <p class="text-lg">Loading course data...</p>
    </div>
  {:else if course.error}
    <div class="card preset-filled-error-500 p-4">
      <p class="font-bold">Error loading course</p>
      <p class="text-sm">{course.error}</p>
    </div>
  {:else}
    <div class="space-y-8">
      <!-- Heatmaps: Calendar and Lab median by day -->
      {#if dates.length > 0 && (medianByDay || labsMedianByDay)}
        <section class="heatmap-full-width -mx-2 w-[calc(100%+1rem)] min-w-0 space-y-6 px-4">
          {#if medianByDay}
            <div>
              <h2 class="text-xl font-semibold mb-4">Calendar Median by Day</h2>
              <CalendarHeatmap
                calendarByDay={medianByDay}
                dates={dates}
                elementId="medians-calendar-heatmap"
              />
            </div>
          {/if}
          {#if labsMedianByDay}
            <div>
              <h2 class="text-xl font-semibold mb-4">Lab Median by Day</h2>
              <CalendarHeatmap
                calendarByDay={labsMedianByDay}
                dates={dates}
                elementId="medians-lab-heatmap"
              />
            </div>
          {/if}
        </section>
      {/if}

      <!-- Calendar Median by Week -->
      {#if medianByWeek}
        <div class="card p-6">
          <h2 class="text-xl font-semibold mb-4">Calendar Median by Week</h2>
          <div class="overflow-x-auto">
            <table class="w-full border-collapse" style="table-layout: fixed;">
              <thead>
                <tr class="border-b-2 border-surface-300">
                  <th class="text-right py-4 px-4 font-semibold" style="width: 80px;">Total</th>
                  {#each weeks as week}
                    <th class="text-center py-4 px-1 font-semibold align-middle" style="width: 48px; min-width: 48px;">
                      <div class="transform -rotate-90 whitespace-nowrap text-xs" style="height: 100%; display: flex; align-items: center; justify-content: center;">
                        {formatDateShort(week)}
                      </div>
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-surface-200">
                  <td class="py-3 px-4 text-right font-mono font-semibold" style="background-color: {cellColorForMinutes((medianByWeek.totalSeconds ?? 0))}">
                    {formatTime(medianByWeek.totalSeconds)}
                  </td>
                  {#each weeks as week}
                    {@const val = medianByWeek[week] as number | undefined}
                    <td class="py-3 px-1 text-center font-mono text-xs" style="width: 48px; min-width: 48px; background-color: {cellColorForMinutes(val ?? 0)}">
                      {formatTime(val)}
                    </td>
                  {/each}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      {/if}

      <!-- Calendar Median by Day -->
      {#if medianByDay}
        <div class="card p-6">
          <h2 class="text-xl font-semibold mb-4">Calendar Median by Day</h2>
          <div class="overflow-x-auto">
            <table class="w-full border-collapse" style="table-layout: fixed;">
              <thead>
                <tr class="border-b-2 border-surface-300">
                  <th class="text-right py-4 px-4 font-semibold" style="width: 80px;">Total</th>
                  {#each dates as date}
                    <th class="text-center py-4 px-1 font-semibold align-middle" style="width: 48px; min-width: 48px;">
                      <div class="transform -rotate-90 whitespace-nowrap text-xs" style="height: 100%; display: flex; align-items: center; justify-content: center;">
                        {formatDateShort(date)}
                      </div>
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-surface-200">
                  <td class="py-3 px-4 text-right font-mono font-semibold" style="background-color: {cellColorForMinutes((medianByDay.totalSeconds ?? 0))}">
                    {formatTime(medianByDay.totalSeconds)}
                  </td>
                  {#each dates as date}
                    {@const val = medianByDay[date] as number | undefined}
                    <td class="py-3 px-1 text-center font-mono text-xs" style="width: 48px; min-width: 48px; background-color: {cellColorForMinutes(val ?? 0)}">
                      {formatTime(val)}
                    </td>
                  {/each}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      {/if}

      <!-- Lab Median by Lab -->
      {#if medianByLab}
        <div class="card p-6">
          <h2 class="text-xl font-semibold mb-4">Lab Median by Lab</h2>
          <div class="overflow-x-auto">
            <table class="w-full border-collapse" style="table-layout: fixed;">
              <thead>
                <tr class="border-b-2 border-surface-300">
                  <th class="text-right py-4 px-4 font-semibold" style="width: 80px; height: 140px;">Total</th>
                  {#each labs as labId}
                    <th class="text-center py-4 px-1 font-semibold align-middle" style="width: 48px; min-width: 48px; height: 140px;">
                      <div class="transform -rotate-90 whitespace-nowrap text-xs" style="height: 100%; display: flex; align-items: center; justify-content: center;">
                        {extractLabIdentifier(labId)}
                      </div>
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-surface-200">
                  <td class="py-3 px-4 text-right font-mono font-semibold" style="background-color: {cellColorForMinutes(medianByLab.totalMinutes ?? 0)}">
                    {formatTime(medianByLab.totalMinutes)}
                  </td>
                  {#each labs as labId}
                    {@const val = medianByLab[labId] as number | undefined}
                    <td class="py-3 px-1 text-center font-mono text-xs" style="width: 48px; min-width: 48px; background-color: {cellColorForMinutes(val ?? 0)}">
                      {formatTime(val)}
                    </td>
                  {/each}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      {/if}

      <!-- Lab Median by Step -->
      {#if medianByStep}
        <div class="card p-6">
          <h2 class="text-xl font-semibold mb-4">Lab Median by Step</h2>
          <div class="overflow-x-auto">
            <table class="w-full border-collapse" style="table-layout: fixed;">
              <thead>
                <tr class="border-b-2 border-surface-300">
                  <th class="text-right py-4 px-4 font-semibold" style="width: 80px; height: 140px;">Total</th>
                  {#each steps as stepId}
                    <th class="text-center py-4 px-1 font-semibold align-middle" style="width: 48px; min-width: 48px; height: 140px;">
                      <div class="transform -rotate-90 whitespace-nowrap text-xs" style="height: 100%; display: flex; align-items: center; justify-content: center;">
                        {extractStepName(stepId)}
                      </div>
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-surface-200">
                  <td class="py-3 px-4 text-right font-mono font-semibold" style="background-color: {cellColorForMinutes(medianByStep.totalMinutes ?? 0)}">
                    {formatTime(medianByStep.totalMinutes)}
                  </td>
                  {#each steps as stepId}
                    {@const val = medianByStep[stepId] as number | undefined}
                    <td class="py-3 px-1 text-center font-mono text-xs" style="width: 48px; min-width: 48px; background-color: {cellColorForMinutes(val ?? 0)}">
                      {formatTime(val)}
                    </td>
                  {/each}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      {/if}

      {#if !medianByWeek && !medianByDay && !medianByLab && !medianByStep}
        <div class="flex items-center justify-center p-8">
          <p class="text-lg text-surface-600">No median data found for this course.</p>
        </div>
      {/if}
    </div>
  {/if}
</section>
