<script lang="ts">
  import type { Calendar } from "@tutors/tutors-model-lib";
  import { t, locale } from "@tutors/i18n";
  import { tick } from "svelte";
  import { prefersReducedMotion } from "@tutors/a11y";
  let { calendar }: { calendar: Calendar } = $props();
  let filter = $state("all");
  let agenda: HTMLDivElement;
  const hasAssessments = $derived(calendar.weeks.some(w => w.assessment));
  const hasWeekNumbers = $derived(calendar.weeks.some(w => w.weekNumber != null));
  const weeks = $derived(calendar.weeks.filter(week => filter !== "assessments" || week.assessment));

  function formatDate(value: string, deadline = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale.value, {
      day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
      ...(deadline && value.includes("T") ? { hour: "2-digit", minute: "2-digit", timeZoneName: "short" } as const : {})
    }).format(date);
  }

  async function showCurrentWeek() {
    filter = "all";
    await tick();
    const current = agenda?.querySelector<HTMLElement>('[aria-current="date"]');
    current?.scrollIntoView({ behavior: prefersReducedMotion.value ? "auto" : "smooth", block: "center" });
    current?.focus({ preventScroll: true });
  }
</script>

<div class="calendar-toolbar">
  <button class="ui-button" disabled={!calendar.currentWeek} onclick={showCurrentWeek}>{t("shell.thisWeek")}</button>
  {#if hasAssessments}
    <label class="calendar-filter">{t("shell.show")}<select class="select" bind:value={filter}><option value="all">{t("shell.allWeeks")}</option><option value="assessments">{t("shell.assessments")}</option></select></label>
  {/if}
</div>
<div class="calendar-agenda" bind:this={agenda}>
  {#if weeks.length}
    <table class="calendar-table" aria-label={calendar.title}>
      <thead><tr><th scope="col">{t("content.dateStarts")}</th>{#if hasWeekNumbers}<th scope="col">{t("content.weekNo")}</th>{/if}<th scope="col">{t("shell.topics")}</th>{#if hasAssessments}<th scope="col">{t("shell.assessments")}</th>{/if}</tr></thead>
      <tbody>
        {#each weeks as week}
          <tr aria-current={calendar.currentWeek?.date === week.date ? "date" : undefined} tabindex="-1">
            <td class="week-date"><time datetime={week.date}>{formatDate(week.date)}</time></td>
            {#if hasWeekNumbers}<td class="week-number"><span class="mobile-week-label">{t("content.weekNo")}</span>{" "}{week.weekNumber ?? "—"}</td>{/if}
            <td class="week-topic"><strong>{week.title}</strong>{#if calendar.currentWeek?.date === week.date}<span class="current-week"><span aria-hidden="true">●</span>{t("nav.calendar.label")}</span>{/if}</td>
            {#if hasAssessments}<td class="week-assessment" class:empty={!week.assessment}>{#if week.assessment}<div class="assessment-title"><strong>{week.assessment.name}</strong><span>{week.assessment.percentage}%</span></div><time datetime={week.assessment.due}>{formatDate(week.assessment.due, true)}</time><p>{week.assessment.submission}</p>{:else}<span class="ui-muted">—</span>{/if}</td>{/if}
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}<p class="ui-empty">{t("shell.emptyCalendar")}</p>{/if}
</div>
<style>
  .calendar-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-4); margin-bottom: var(--space-6); }
  .calendar-filter { display: flex; align-items: center; gap: var(--space-3); color: var(--ui-muted); font-size: var(--font-label); }
  select { appearance: auto; min-height: 44px; max-width: 220px; padding: var(--space-2) var(--space-3); border: 1px solid var(--ui-control-border); border-radius: var(--radius-control); color: var(--ui-ink); background-color: var(--ui-surface); font-size: var(--font-control); }
  table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--font-label); }
  th { text-align: left; color: var(--ui-muted); font-size: var(--font-small); letter-spacing: .08em; text-transform: uppercase; font-weight: var(--weight-semibold); background: var(--ui-canvas); }
  th, td { padding: var(--space-4); border-bottom: 1px solid var(--ui-border); vertical-align: top; }
  th:first-child { border-radius: var(--radius-control) 0 0 var(--radius-control); }
  th:last-child { border-radius: 0 var(--radius-control) var(--radius-control) 0; }
  tr[aria-current] { background: var(--ui-selected); }
  tr[aria-current] td:first-child { box-shadow: inset 3px 0 var(--ui-brand); }
  tr:focus-visible { outline: 3px solid var(--ui-focus); outline-offset: -3px; }
  .week-date { width: 136px; white-space: nowrap; color: var(--ui-muted); }
  .week-number { width: 60px; font-variant-numeric: tabular-nums; color: var(--ui-muted); }
  .week-topic { min-width: 140px; }
  strong { font-weight: var(--weight-medium); }
  .current-week { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); color: var(--ui-brand); font-size: var(--font-caption); }
  .current-week > span { font-size: 8px; }
  .week-assessment { max-width: 320px; font-size: var(--font-caption); overflow-wrap: anywhere; }
  .assessment-title { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-2); font-size: var(--font-label); }
  .assessment-title span, .week-assessment time, .week-assessment p { color: var(--ui-muted); }
  .week-assessment p { margin-top: var(--space-1); }
  .mobile-week-label { display: none; }
  @media (max-width: 767px) {
    table, tbody { display: block; }
    thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    tr { display: grid; grid-template-columns: minmax(0, 1fr) auto; border: 1px solid var(--ui-border); border-radius: var(--radius-card); margin-bottom: var(--space-3); padding: var(--space-4); gap: var(--space-3); }
    td { display: block; border: none; padding: 0; min-width: 0; }
    .week-date, .week-number { width: auto; }
    .week-number { text-align: right; font-size: var(--font-caption); }
    .mobile-week-label { display: inline; }
    .week-topic, .week-assessment { grid-column: 1 / -1; max-width: none; }
    .week-topic { font-size: var(--font-body); }
    .week-assessment { padding-top: var(--space-3); border-top: 1px solid var(--ui-border); }
    .week-assessment.empty { display: none; }
    tr[aria-current] { box-shadow: inset 3px 0 var(--ui-brand); border-color: var(--ui-control-border); }
    tr[aria-current] td:first-child { box-shadow: none; }
  }
</style>
