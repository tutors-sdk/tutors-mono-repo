<script lang="ts">
  import AssignmentsTable from "$lib/components/tables/AssignmentsTable.svelte";
  import { page } from "$app/state";

  const courseId = $derived((page.params.courseid as string) ?? "");
</script>

<svelte:head>
  <title>Assignments</title>
  <meta name="description" content="Assignments and submission counts for course" />
</svelte:head>

{#key courseId}
  <AssignmentsTable courseId={courseId} />
{/key}
