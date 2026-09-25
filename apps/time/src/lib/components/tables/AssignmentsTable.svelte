<script lang="ts">
  import { getTutorsTimeSource } from "@tutors/tutors-time-lib";
  import { onMount } from "svelte";
  import log from "@tutors/logger";

  let { courseId }: { courseId: string } = $props();

  interface AssignmentRow {
    id: number;
    name: string | null;
    url: string | null;
    due_date: string | null;
    opened_date: string | null;
    submissionCount: number;
  }

  let rows = $state<AssignmentRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    const id = courseId.trim();
    if (!id) {
      error = "Course ID is required.";
      loading = false;
      return;
    }
    try {
      // The reader counts submissions per assignment; only an educator of the course gets any.
      rows = (await getTutorsTimeSource().courseRows(id)).assignments;
    } catch (e) {
      log.error("AssignmentsTable failed to load:", e);
      error = e instanceof Error ? e.message : "Failed to load assignments";
    } finally {
      loading = false;
    }
  });

  const totalSubmissions = $derived(rows.reduce((sum, r) => sum + r.submissionCount, 0));

  function formatDate(dateString: string | null): string {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return dateString;
    }
  }
</script>

{#if loading}
  <div class="flex items-center justify-center p-8">
    <p class="text-lg">Loading assignments...</p>
  </div>
{:else if error}
  <div class="ui-panel border-[var(--ui-danger)] p-4">
    <p class="font-bold">Error loading data</p>
    <p class="text-sm">{error}</p>
  </div>
{:else if rows.length === 0}
  <div class="flex items-center justify-center p-8">
    <p class="text-lg text-[var(--ui-muted)]">No assignments available</p>
  </div>
{:else}
  <div class="table-wrap overflow-x-auto">
    <table class="table">
      <thead>
        <tr>
          <th>Course ID</th>
          <th>Assignment</th>
          <th>Due Date</th>
          <th class="text-right">Submissions</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.id)}
          <tr>
            <td>{courseId}</td>
            <td>
              {#if row.url}
                <a class="anchor" href={row.url} target="_blank" rel="noopener noreferrer">
                  {row.name ?? row.id}
                </a>
              {:else}
                {row.name ?? row.id}
              {/if}
            </td>
            <td>{formatDate(row.due_date)}</td>
            <td class="text-right">{row.submissionCount}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3"></td>
          <th class="text-right">Total: {totalSubmissions}</th>
        </tr>
      </tfoot>
    </table>
  </div>
  <p class="mt-4 text-sm text-[var(--ui-muted)]">
    Showing {rows.length} {rows.length === 1 ? "assignment" : "assignments"}
  </p>
{/if}
