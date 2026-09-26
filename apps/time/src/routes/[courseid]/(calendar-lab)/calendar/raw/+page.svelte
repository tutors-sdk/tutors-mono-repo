<script lang="ts">
  import CalendarTable from "$lib/components/tables/CalendarTable.svelte";
  import { page } from "$app/stores";

  const courseId = $derived(($page.params.courseid as string) ?? "");
</script>

<svelte:head>
  <title>Raw Calendar</title>
  <meta name="description" content="Raw calendar data for course" />
</svelte:head>

{#key courseId}
  <CalendarTable courseId={courseId} />
{/key}
