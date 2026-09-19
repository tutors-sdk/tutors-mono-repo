<script lang="ts">
  import type { ActiveSession } from "@tutors/live-store";
  import { loLabel, since } from "$lib/format";

  /**
   * One row per session that is open right now: where it is, what it is
   * reading, and how long since it last did anything.
   *
   * The handle is derived from the day's session token, not the token itself,
   * and it means nothing tomorrow - there is no person behind it to look up.
   */
  interface Props {
    sessions: ActiveSession[];
    /** Set on a course page, where the course column would say the same thing every row. */
    hideCourse?: boolean;
    limit?: number;
  }
  let { sessions, hideCourse = false, limit = 12 }: Props = $props();

  const shown = $derived(sessions.slice(0, limit));
  const remaining = $derived(Math.max(0, sessions.length - shown.length));

  /** Idle long enough to have probably wandered off, but not yet out of the window. */
  function stale(idleSec: number): boolean {
    return idleSec >= 60;
  }
</script>

<section class="card preset-filled-surface-100-900 flex min-w-0 flex-col gap-3 p-4">
  <header class="flex flex-wrap items-baseline justify-between gap-2">
    <h2 class="text-base font-semibold">Sessions open now</h2>
    <span class="text-surface-600-400 text-xs">{sessions.length} in the last 2 minutes</span>
  </header>

  {#if sessions.length === 0}
    <p class="text-surface-600-400 py-4 text-center text-sm">Nobody is reading right now.</p>
  {:else}
    <div class="table-wrap">
      <table class="table table-fixed text-sm">
        <thead>
          <tr>
            <th class="w-20">Session</th>
            {#if !hideCourse}<th>Course</th>{/if}
            <th>Reading</th>
            <th class="w-24 text-right">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {#each shown as session (session.handle)}
            <tr>
              <td class="font-mono text-xs">
                <span
                  class="mr-1 inline-block size-2 rounded-full align-middle {stale(session.idleSec) ? 'bg-warning-500' : 'bg-success-500'}"
                  aria-hidden="true"
                ></span>{session.handle}
              </td>
              {#if !hideCourse}
                <td class="truncate"><a class="anchor" href="/course/{session.course}">{session.course}</a></td>
              {/if}
              <td class="text-surface-700-300 truncate" title={session.lo ?? ""}>
                {session.lo ? loLabel(session.lo) : "—"}
              </td>
              <td class="text-right text-xs tabular-nums">{since(session.lastSeen)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if remaining > 0}
      <p class="text-surface-600-400 text-xs">and {remaining} more session{remaining === 1 ? "" : "s"}</p>
    {/if}
  {/if}

  <p class="text-surface-600-400 text-xs">
    A session handle is derived from that day's random token. It is not a person, and it does not survive the night.
  </p>
</section>
