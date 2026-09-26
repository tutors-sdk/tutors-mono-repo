<script lang="ts">
  import { page } from "$app/state";
  import { t, type MessageKey } from "@tutors/i18n";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import SecondaryNavigator from "@tutors/ui-navigators/SecondaryNavigator.svelte";
  import StudentAvatar from "$lib/components/StudentAvatar.svelte";

  let { children } = $props();

  const summaries: Partial<Record<MessageKey, MessageKey>> = {
    "classTime.medians": "classTime.mediansSummary",
    "classTime.calendarByWeek": "classTime.calendarByWeekSummary",
    "classTime.calendarByDay": "classTime.calendarByDaySummary",
    "classTime.labsByLab": "classTime.labsByLabSummary",
    "classTime.labsByStep": "classTime.labsByStepSummary",
    "classTime.rawCalendar": "classTime.rawCalendarSummary",
    "classTime.learningRecords": "classTime.learningRecordsSummary",
    "classTime.assignments": "classTime.assignmentsSummary"
  };

  const courseId = $derived(page.params.courseid ?? "");
  const student = $derived(page.data.studentName as string | null);
  const sentiment = $derived((page.data.sentiment as string | null) || "neutral");
  const viewType = $derived(page.data.viewType as MessageKey | null);
  const summary = $derived(viewType ? summaries[viewType] : undefined);
</script>

{#if student}
  <SecondaryNavigator home={{ title: t("shell.classActivity"), route: `/${courseId}/medians` }} lo={{ breadCrumbs: [{ title: student, route: page.url.pathname }] }} />
{/if}
<div class="ui-page">
  {#if student}
    <header class="time-header">
      <div>
        <p class="ui-eyebrow">{t("classTime.student")}</p>
        <h1 class="ui-title">{student}</h1>
        <p class="ui-muted">{t("classTime.studentSummary")}</p>
      </div>
      <div class="time-header-art">
        <Icon type={sentiment} tip={`${t("content.sentimentLabel")}: ${sentiment}`} height="40" />
        <StudentAvatar fullName={student} avatarUrl={page.data.avatarUrl} size="size-16" initialClass="text-2xl" />
      </div>
    </header>
  {:else if viewType}
    <header class="time-header">
      <div>
        <p class="ui-eyebrow">{t("shell.classActivity")}</p>
        <h1 class="ui-title">{t(viewType)}</h1>
        {#if summary}<p class="ui-muted">{t(summary)}</p>{/if}
      </div>
    </header>
  {/if}
  <div class="time-body">{@render children()}</div>
</div>

<style>
  .time-header { display: flex; align-items: end; justify-content: space-between; gap: var(--space-6); }
  .time-header > div:first-child { min-width: 0; }
  .time-header .ui-title, .time-header .ui-muted { margin-top: var(--space-2); }
  .time-header-art { display: flex; flex-shrink: 0; align-items: center; gap: var(--space-3); }
  .time-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-6); margin-top: var(--space-8); }
</style>
