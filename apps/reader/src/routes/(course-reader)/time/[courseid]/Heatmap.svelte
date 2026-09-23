<script lang="ts">
  import { t, locale } from "@tutors/i18n";
  import { formatDateShort } from "@tutors/tutors-time-lib";
  import { heatColor, minutesOf } from "./heat";

  /** Minutes per day keyed by date (YYYY-MM-DD) across the course's dates. */
  let { title, values, dates }: { title: string; values: Record<string, unknown>; dates: string[] } = $props();

  const iso = (day: Date) => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const inCourse = $derived(new Set(dates));

  /** Monday-first weeks from the first to the last course date. */
  const weeks = $derived.by(() => {
    const sorted = [...dates].sort();
    if (!sorted.length) return [];
    const day = new Date(`${sorted[0]}T12:00:00`);
    day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    const result: string[][] = [];
    while (iso(day) <= sorted[sorted.length - 1]) {
      const week: string[] = [];
      for (let i = 0; i < 7; i++, day.setDate(day.getDate() + 1)) week.push(iso(day));
      result.push(week);
    }
    return result;
  });

  const monthName = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(locale.value, { month: "short" });
  /** Label a week when it holds the first of a month, or when it opens the grid. */
  const monthLabel = (week: string[], index: number) => {
    const first = week.find(date => date.endsWith("-01"));
    return first ? monthName(first) : index === 0 ? monthName(week[0]) : "";
  };
  const weekday = (offset: number) => new Date(2024, 0, 1 + offset).toLocaleDateString(locale.value, { weekday: "short" });
</script>

<section class="ui-panel heatmap-panel">
  <h2 class="ui-section-title">{title}</h2>
  <div class="heatmap" style:--weeks={weeks.length}>
    <span></span>
    <div class="months" aria-hidden="true">{#each weeks as week, index}<span>{monthLabel(week, index)}</span>{/each}</div>
    <div class="weekdays" aria-hidden="true">{#each [0, 2, 4] as offset}<span style:grid-row={offset + 1}>{weekday(offset)}</span>{/each}</div>
    <div class="days" role="img" aria-label={title}>
      {#each weeks as week}
        {#each week as date}
          {@const minutes = minutesOf(values[date])}
          <span class:outside={!inCourse.has(date)} style:background-color={heatColor(minutes) || null} title={`${formatDateShort(date)} · ${minutes} ${t("time.minutes")}`}></span>
        {/each}
      {/each}
    </div>
  </div>
</section>

<style>
  .heatmap-panel { min-width: 0; }
  .heatmap { display: grid; grid-template-columns: auto minmax(0, calc(var(--weeks) * 28px)); justify-content: start; gap: var(--space-2) var(--space-3); margin-top: var(--space-4); overflow-x: auto; }
  .months, .days { display: grid; grid-template-columns: repeat(var(--weeks), minmax(10px, 1fr)); gap: 3px; }
  .months { font-size: var(--font-caption); color: var(--ui-muted); white-space: nowrap; }
  .weekdays { display: grid; grid-template-rows: repeat(7, 1fr); gap: 3px; font-size: var(--font-caption); color: var(--ui-muted); line-height: 1; align-items: center; }
  .days { grid-template-rows: repeat(7, auto); grid-auto-flow: column; }
  .days span { aspect-ratio: 1; border-radius: 3px; background: var(--ui-canvas); box-shadow: inset 0 0 0 1px var(--ui-border); }
  .days span[style] { box-shadow: none; }
  .days .outside { visibility: hidden; }
</style>
