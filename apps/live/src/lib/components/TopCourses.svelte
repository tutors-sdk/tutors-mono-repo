<script lang="ts">
  import type { CourseTotals } from "@tutors/live-store";
  import { count } from "$lib/format";

  /** The top courses by sessions, each linking to its drill-down. */
  interface Props {
    courses: CourseTotals[];
    /** Active sessions per course, so the table shows now as well as the range. */
    activeNow?: Record<string, number>;
  }
  let { courses, activeNow = {} }: Props = $props();
</script>

<section class="card preset-filled-surface-100-900 flex min-w-0 flex-col gap-3 p-4">
  <h2 class="text-base font-semibold">Top courses</h2>
  {#if courses.length === 0}
    <p class="text-surface-600-400 py-4 text-center text-sm">No course activity in this range yet.</p>
  {:else}
    <div class="table-wrap">
      <table class="table table-fixed text-sm">
        <thead>
          <tr>
            <th class="w-1/2">Course</th>
            <th class="text-right">Sessions</th>
            <th class="text-right">Views</th>
            <th class="text-right">Now</th>
          </tr>
        </thead>
        <tbody>
          {#each courses as course (course.course)}
            <tr>
              <td class="truncate"><a class="anchor" href="/course/{course.course}">{course.course}</a></td>
              <td class="text-right tabular-nums">{count(course.sessions)}</td>
              <td class="text-right tabular-nums">{count(course.views)}</td>
              <td class="text-right tabular-nums">
                {#if activeNow[course.course]}
                  <span class="badge preset-filled-success-500">{activeNow[course.course]}</span>
                {:else}
                  <span class="text-surface-600-400">-</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
