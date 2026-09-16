<script lang="ts">
  import type { Calendar } from "@tutors/tutors-model-lib";
  import { t } from "@tutors/i18n";
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  interface Props {
    calendar: Calendar;
  }
  let { calendar }: Props = $props();
  const hasAssessments = $derived(calendar.weeks.some((w) => w.assessment));
  const hasWeekNumbers = $derived(calendar.weeks.some((w) => w.weekNumber != null));

  /** Format assessment due strings (e.g. 2026-09-16T17:00) like week dates: "Sep 16". */
  function formatDueDate(due: string): string {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(due);
    if (iso) {
      return `${monthNames[Number(iso[2]) - 1]} ${Number(iso[3])}`;
    }
    const parsed = new Date(due);
    if (!Number.isNaN(parsed.getTime())) {
      return `${monthNames[parsed.getMonth()]} ${parsed.getDate()}`;
    }
    return due;
  }
</script>

<h4 class="mb-4 text-center font-semibold">
  {calendar.title}{#if calendar.year} {calendar.year}{/if}
</h4>
<div class="table-wrap">
  <table class="table table-zebra" aria-label={calendar.title}>
    <thead>
      <tr>
        {#if hasWeekNumbers}
          <th class="text-center" scope="col">{t("content.weekNo")}</th>
        {/if}
        <th class="text-center" scope="col">{t("content.type")}</th>
        <th class="text-center" scope="col">{t("content.dateStarts")}</th>
        {#if hasAssessments}
          <th class="text-center" scope="col">Assessment</th>
        {/if}
      </tr>
    </thead>
    <tbody class="text-center [&>tr]:hover:preset-tonal-brand">
      {#each calendar.weeks as week}
        {#if calendar?.currentWeek?.title == week.title}
          <tr aria-current="date" style="background-color: light-dark(var(--color-success-300), var(--color-success-700));">
            {#if hasWeekNumbers}
              <td>{week.weekNumber ?? "-"}</td>
            {/if}
            <td>{week.title}</td>
            <td>{monthNames[week.dateObj.getMonth()]} {week.dateObj.getDate()}</td>
            {#if hasAssessments}
              <td>
                {#if week.assessment}
                  <div class="text-sm font-semibold">{week.assessment.name}</div>
                  <div class="text-xs font-bold">Due: {formatDueDate(week.assessment.due)} ({week.assessment.percentage}%)</div>
                  <div class="text-xs">{week.assessment.submission}</div>
                {/if}
              </td>
            {/if}
          </tr>
        {:else}
          <tr>
            {#if hasWeekNumbers}
              <td>{week.weekNumber ?? "-"}</td>
            {/if}
            <td>{week.title}</td>
            <td>{monthNames[week.dateObj.getMonth()]} {week.dateObj.getDate()}</td>
            {#if hasAssessments}
              <td>
                {#if week.assessment}
                  <div class="text-sm font-semibold">{week.assessment.name}</div>
                  <div class="text-xs font-bold">Due: {formatDueDate(week.assessment.due)} ({week.assessment.percentage}%)</div>
                  <div class="text-xs">{week.assessment.submission}</div>
                {/if}
              </td>
            {/if}
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</div>
