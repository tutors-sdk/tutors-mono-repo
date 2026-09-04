<script lang="ts">
  import GistsTable from "$lib/components/tables/GistsTable.svelte";
  import { page } from "$app/stores";

  const courseId = $derived(($page.params.courseid as string) ?? "");
</script>

<svelte:head>
  <title>Shared snippets</title>
  <meta name="description" content="Ephemeral snippets students have shared, auto-deleting after 48 hours" />
</svelte:head>

{#key courseId}
  <section class="p-2 h-[calc(100vh-4rem)]">
    <div class="card p-4 h-full flex flex-col">
      <div class="flex flex-col flex-1 min-h-0 overflow-auto">
        <GistsTable courseId={courseId} />
      </div>
    </div>
  </section>
{/key}
