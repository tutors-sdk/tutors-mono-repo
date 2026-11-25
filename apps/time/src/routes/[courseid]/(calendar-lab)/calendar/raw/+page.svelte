<script lang="ts">
  import CalendarTable from "#lib/components/tables/CalendarTable.svelte";
  import { page } from "$app/state";
  import { rangeOf } from "#lib/dateRange.ts";

  const courseId = $derived((page.params.courseid as string) ?? "");
  const period = $derived(rangeOf(page.url.search));
</script>

<svelte:head>
  <title>Raw Calendar</title>
  <meta name="description" content="Raw calendar data for course" />
</svelte:head>

{#key `${courseId}${page.url.search}`}
  <CalendarTable courseId={courseId} {period} />
{/key}
