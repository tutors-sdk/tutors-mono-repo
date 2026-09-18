<script lang="ts">
  import type { ActivityResponse, RangeName } from "@tutors/live-store";
  import { count, duration, percent, since } from "$lib/format";

  /**
   * Per-course activity in numbers, beside the heat map that shows its shape.
   *
   * "Visitors" is distinct token-days, and "came back" means a token that
   * opened the course more than once on the same day. Both are the honest
   * limits of a token that is regenerated every night, and the note under the
   * table says so rather than letting the column headings imply more.
   */
  interface Props {
    activity: ActivityResponse | null;
    range: RangeName;
    limit?: number;
  }
  let { activity, range, limit = 12 }: Props = $props();

  const rangeLabel: Record<RangeName, string> = { today: "today", "7d": "in 7 days", "30d": "in 30 days" };
  const rows = $derived((activity?.courses ?? []).slice(0, limit));
</script>

<section class="card preset-filled-surface-100-900 flex min-w-0 flex-col gap-3 p-4">
  <header class="flex flex-wrap items-baseline justify-between gap-2">
    <h2 class="text-base font-semibold">Course activity</h2>
    {#if activity}
      <span class="text-surface-600-400 text-xs">
        {count(activity.visitors)} visitors · {count(activity.sessions)} sessions · {percent(activity.returningRate)} came back
      </span>
    {/if}
  </header>

  {#if rows.length === 0}
    <p class="text-surface-600-400 py-4 text-center text-sm">No course activity in this range yet.</p>
  {:else}
    <div class="table-wrap">
      <table class="table table-fixed text-sm">
        <thead>
          <tr>
            <th class="w-1/3">Course</th>
            <th class="w-16 text-right">Now</th>
            <th class="w-24 text-right">Last seen</th>
            <th class="text-right">Visitors</th>
            <th class="text-right">Sessions</th>
            <th class="text-right">Views</th>
            <th class="text-right">Came back</th>
            <th class="text-right">Median</th>
            <th class="text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.course)}
            <tr>
              <td class="truncate"><a class="anchor" href="/course/{row.course}">{row.course}</a></td>
              <td class="text-right tabular-nums">
                {#if row.activeNow > 0}
                  <span class="badge preset-filled-success-500">{row.activeNow}</span>
                {:else}
                  <span class="text-surface-600-400">—</span>
                {/if}
              </td>
              <td class="text-right text-xs tabular-nums">{since(row.lastSeen)}</td>
              <td class="text-right tabular-nums">{count(row.visitors)}</td>
              <td class="text-right tabular-nums">{count(row.sessions)}</td>
              <td class="text-right tabular-nums">{count(row.views)}</td>
              <td class="text-right tabular-nums" title="{count(row.returningSessions)} of {count(row.sessions)} sessions">
                {percent(row.returningRate)}
              </td>
              <td class="text-right tabular-nums">{duration(row.medianSessionSec)}</td>
              <td class="text-right tabular-nums">{duration(row.totalTimeSec)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <p class="text-surface-600-400 text-xs">
    Visitors are distinct daily tokens {rangeLabel[range]}; "came back" is the share of sessions from a token that opened the course more than
    once on the same day. Tokens are regenerated every night, so nobody is counted across days.
  </p>
</section>
