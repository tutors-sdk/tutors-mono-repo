<script lang="ts">
  import { untrack } from "svelte";
  import { t } from "@tutors/i18n";
  import { insightsService } from "#lib/insights.ts";
  import InsightsPeriod from "./InsightsPeriod.svelte";
  import InsightsRefusal from "./InsightsRefusal.svelte";
  import ResponseTimesTable from "./ResponseTimesTable.svelte";
  import StepStruggleTable from "./StepStruggleTable.svelte";

  interface Props {
    courseId: string;
    /** Which insight the page shows: the steps ranked by struggle, or help response times. */
    show: "steps" | "response";
  }

  let { courseId, show }: Props = $props();

  // An educator opens the course's insights: they are read for the chosen span (Rule 0412).
  // Only the props are tracked: the service reads and writes its own state, which must not reopen the page.
  $effect(() => {
    const id = courseId;
    untrack(() => void insightsService.openCourse(id));
    return () => untrack(() => insightsService.close());
  });

  const view = $derived(insightsService.course.value);
</script>

<header class="insights-header">
  <p class="ui-eyebrow">{t("insights.eyebrow")}</p>
  <h1 class="ui-title">{t(show === "steps" ? "insights.steps" : "insights.response")}</h1>
  <p class="ui-muted">{t(show === "steps" ? "insights.stepsSummary" : "insights.responseSummary")}</p>
</header>

<InsightsPeriod />

<section class="ui-panel" aria-busy={view.loading}>
  {#if view.answer && !view.answer.ok}
    <InsightsRefusal reason={view.answer.reason} />
  {:else if view.answer?.ok}
    {@const insights = view.answer.value}
    <p class="ui-muted cohort">{t("insights.students")}: {insights.cohort.students}</p>
    {#if !insights.cohort.percentilesShown}
      <p class="ui-muted withheld" role="note">{t("insights.withheld")}</p>
    {/if}
    {#if (show === "steps" ? insights.steps.length : insights.responseTimes.length) === 0}
      <p class="ui-empty">{t("insights.empty")}</p>
    {:else if show === "steps"}
      <StepStruggleTable steps={insights.steps} percentilesShown={insights.cohort.percentilesShown} />
    {:else}
      <ResponseTimesTable days={insights.responseTimes} percentilesShown={insights.cohort.percentilesShown} />
    {/if}
  {:else}
    <p class="ui-muted" role="status">{t("insights.loading")}</p>
  {/if}
</section>

<style>
  .insights-header { display: grid; gap: var(--space-2); margin-block-end: var(--space-2); }
  .cohort, .withheld { margin-block: 0 var(--space-3); font-size: var(--font-label); }
</style>
