<script lang="ts">
  import LearningRecordsTable from "#lib/components/tables/LearningRecordsTable.svelte";
  import { page } from "$app/state";
  import { rangeOf } from "#lib/dateRange.ts";

  const courseId = $derived((page.params.courseid as string) ?? "");
  const period = $derived(rangeOf(page.url.search));
</script>

<svelte:head>
  <title>Learning Records</title>
  <meta name="description" content="Lab learning records for course" />
</svelte:head>

{#key `${courseId}${page.url.search}`}
  <LearningRecordsTable courseId={courseId} {period} />
{/key}
