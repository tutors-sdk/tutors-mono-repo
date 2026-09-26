<script lang="ts">
  import { page } from "$app/state";
  import StudentAvatar from "$lib/components/StudentAvatar.svelte";
  import SentimentIcon, { SENTIMENT_ICONS, type Sentiment } from "$lib/components/SentimentIcon.svelte";

  let { children } = $props();

  const summaries: Record<string, string> = {
    Medians: "The median student's minutes across the course, by day, week, lab and step.",
    "Calendar by week": "Minutes each student was active in the course, week by week.",
    "Calendar by day": "Minutes each student was active in the course, day by day.",
    "Labs by lab": "Minutes each student spent in each lab.",
    "Labs by step": "Minutes each student spent on each lab step.",
    "Raw calendar": "Every calendar record for the course, as stored.",
    "Learning records": "Every lab learning record for the course, as stored.",
    Assignments: "Moodle assignments for the course and how many students have submitted each."
  };

  const student = $derived(page.data.studentName as string | null);
  const sentiment = $derived((page.data.sentiment ?? "neutral") as Sentiment);
  const viewType = $derived((page.data.viewType ?? "") as string);
</script>

<div class="ui-page">
  {#if student}
    <header class="time-header">
      <div>
        <p class="ui-eyebrow">Student</p>
        <h1 class="ui-title">{student}</h1>
        <p class="ui-muted">Minutes this student was active, beside the course median.</p>
      </div>
      <div class="time-header-art">
        {#if sentiment in SENTIMENT_ICONS}<SentimentIcon {sentiment} label={`Sentiment: ${sentiment}`} />{/if}
        <StudentAvatar fullName={student} avatarUrl={page.data.avatarUrl} size="size-16" initialClass="text-2xl" />
      </div>
    </header>
  {:else}
    <header class="time-header">
      <div>
        <p class="ui-eyebrow">Class activity</p>
        <h1 class="ui-title">{viewType}</h1>
        {#if summaries[viewType]}<p class="ui-muted">{summaries[viewType]}</p>{/if}
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
