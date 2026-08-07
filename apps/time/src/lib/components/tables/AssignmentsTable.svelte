<script lang="ts">
  import { getSupabase } from "@tutors/tutors-time-lib";
  import { onMount } from "svelte";

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
      const supabase = getSupabase();

      const { data: assignments, error: assignmentsError } = await supabase
        .from("assignments")
        .select("id, name, url, due_date, opened_date")
        .eq("courseid", id);

      if (assignmentsError) throw new Error(assignmentsError.message);

      const assignmentIds = (assignments ?? []).map((a) => a.id as number);

      const countsByAssignment = new Map<number, number>();
      if (assignmentIds.length > 0) {
        const { data: submissions, error: submissionsError } = await supabase
          .from("assignments_submissions")
          .select("assignmentId")
          .in("assignmentId", assignmentIds);

        if (submissionsError) throw new Error(submissionsError.message);

        for (const s of submissions ?? []) {
          const aid = (s as { assignmentId: number }).assignmentId;
          countsByAssignment.set(aid, (countsByAssignment.get(aid) ?? 0) + 1);
        }
      }

      rows = (assignments ?? []).map((a) => ({
        id: a.id as number,
        name: (a as { name: string | null }).name,
        url: (a as { url: string | null }).url,
        due_date: (a as { due_date: string | null }).due_date,
        opened_date: (a as { opened_date: string | null }).opened_date,
        submissionCount: countsByAssignment.get(a.id as number) ?? 0
      }));
    } catch (e) {
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
  <div class="card preset-filled-error-500 p-4">
    <p class="font-bold">Error loading data</p>
    <p class="text-sm">{error}</p>
  </div>
{:else if rows.length === 0}
  <div class="flex items-center justify-center p-8">
    <p class="text-lg text-surface-600">No assignments available</p>
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
  <p class="mt-4 text-sm text-surface-600">
    Showing {rows.length} {rows.length === 1 ? "assignment" : "assignments"}
  </p>
{/if}
