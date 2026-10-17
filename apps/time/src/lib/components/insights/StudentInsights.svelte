<script lang="ts">
  import { untrack } from "svelte";
  import { t } from "@tutors/i18n";
  import { insightsService } from "#lib/insights.ts";
  import InsightsPeriod from "./InsightsPeriod.svelte";
  import InsightsRefusal from "./InsightsRefusal.svelte";

  interface Props {
    courseId: string;
    learnerId: string;
  }

  let { courseId, learnerId }: Props = $props();

  // Read when the page opens and when it moves to another student (Rule 0414).
  // Only the props are tracked: the service reads and writes its own state, which must not reopen the page.
  $effect(() => {
    const [course, learner] = [courseId, learnerId];
    untrack(() => void insightsService.openStudent(course, learner));
    return () => untrack(() => insightsService.close());
  });

  const view = $derived(insightsService.student.value);
</script>

<section class="ui-panel student-insights" aria-labelledby="student-insights-title">
  <h2 id="student-insights-title" class="ui-section-title">{t("insights.student")}</h2>
  <InsightsPeriod />
  {#if view.answer && !view.answer.ok}
    <InsightsRefusal reason={view.answer.reason} />
  {:else if view.answer?.ok}
    {@const progress = view.answer.value}
    <dl class="tiles" aria-busy={view.loading}>
      <div><dt>{t("insights.requestsRaised")}</dt><dd>{progress.requestsRaised}</dd></div>
      <div><dt>{t("insights.hintsRead")}</dt><dd>{progress.hintsRead}</dd></div>
      <div><dt>{t("insights.annotationsReceived")}</dt><dd>{progress.annotationsReceived}</dd></div>
    </dl>
  {:else}
    <p class="ui-muted" role="status">{t("insights.loading")}</p>
  {/if}
</section>

<style>
  .student-insights { margin-block: var(--space-6); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: var(--space-4); margin: 0; }
  .tiles div { padding: var(--space-4); border: 1px solid var(--ui-border); border-radius: var(--radius-control); }
  dt { color: var(--ui-muted); font-size: var(--font-label); }
  dd { margin: var(--space-1) 0 0; font-size: var(--font-title); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; }
</style>
