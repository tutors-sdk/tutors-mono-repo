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
  <section class="p-2 h-[calc(100vh-4rem)]">
    <div class="card p-4 h-full flex flex-col">
      <div class="flex flex-col flex-1 min-h-0 overflow-auto">
        <CalendarTable courseId={courseId} />
      </div>
    </div>
  </section>
{/key}
