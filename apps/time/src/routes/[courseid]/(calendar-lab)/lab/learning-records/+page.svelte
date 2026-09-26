<script lang="ts">
  import LearningRecordsTable from "$lib/components/tables/LearningRecordsTable.svelte";
  import { page } from "$app/state";

  const courseId = $derived((page.params.courseid as string) ?? "");
</script>

<svelte:head>
  <title>Learning Records</title>
  <meta name="description" content="Lab learning records for course" />
</svelte:head>

{#key courseId}
  <LearningRecordsTable courseId={courseId} />
{/key}
