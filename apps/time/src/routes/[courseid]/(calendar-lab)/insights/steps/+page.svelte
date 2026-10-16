<script lang="ts">
  import { page } from "$app/state";
  import { t } from "@tutors/i18n";
  import CourseInsightsView from "#lib/components/insights/CourseInsightsView.svelte";

  const courseId = $derived((page.params.courseid as string) ?? "");
</script>

<svelte:head>
  <title>{t("insights.steps")}</title>
  <meta name="description" content={t("insights.stepsSummary")} />
</svelte:head>

{#key courseId}
  <CourseInsightsView {courseId} show="steps" />
{/key}
