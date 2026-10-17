<script lang="ts">
  import { t } from "@tutors/i18n";
  import { INSIGHTS_SPANS, type InsightsSpan } from "@tutors/insights";
  import { insightsService } from "#lib/insights.ts";

  const labels: Record<InsightsSpan, "insights.span.day" | "insights.span.week" | "insights.span.month"> = {
    day: "insights.span.day",
    week: "insights.span.week",
    month: "insights.span.month"
  };

  /** The span and its last day: choosing either reads the open page again (Rules 0412, 0414). */
  function pickDay(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) void insightsService.choose(insightsService.span.value, value);
  }
</script>

<div class="period ui-actions" role="group" aria-label={t("insights.span")}>
  <div class="segmented">
    {#each INSIGHTS_SPANS as span (span)}
      <button type="button" class="ui-button" aria-pressed={insightsService.span.value === span} onclick={() => insightsService.choose(span)}>{t(labels[span])}</button>
    {/each}
  </div>
  <label class="ending">
    <span class="ui-muted">{t("insights.endingOn")}</span>
    <input type="date" value={insightsService.endingDay()} onchange={pickDay} />
  </label>
</div>

<style>
  .period { margin-block: var(--space-4); }
  .segmented { display: inline-flex; flex-wrap: wrap; gap: var(--space-2); }
  .ending { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--font-label); }
  .ending input { min-height: 44px; padding: 0 var(--space-3); border: 1px solid var(--ui-control-border, var(--ui-border)); border-radius: var(--radius-control); background: var(--ui-surface); color: var(--ui-ink); font: inherit; }
</style>
