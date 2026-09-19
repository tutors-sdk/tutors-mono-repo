<script lang="ts">
  import type { RepeatVisits } from "@tutors/live-store";
  import { count, percent } from "$lib/format";

  /**
   * How many times a visitor opened a course in one day.
   *
   * This is the closest an anonymous model gets to "how often do they come
   * back": within a day the token is stable, so the distribution is exact;
   * across days it does not exist, by design.
   */
  interface Props {
    visits: RepeatVisits[];
    /** Anything at or above this is rolled into one row, so a long tail stays readable. */
    tailFrom?: number;
  }
  let { visits, tailFrom = 5 }: Props = $props();

  const rows = $derived.by(() => {
    const head = visits.filter((entry) => entry.visits < tailFrom);
    const tail = visits.filter((entry) => entry.visits >= tailFrom).reduce((total, entry) => total + entry.tokens, 0);
    return [
      ...head.map((entry) => ({ label: `${entry.visits}×`, tokens: entry.tokens })),
      ...(tail > 0 ? [{ label: `${tailFrom}×+`, tokens: tail }] : [])
    ];
  });

  const total = $derived(rows.reduce((sum, row) => sum + row.tokens, 0));
  const peak = $derived(Math.max(1, ...rows.map((row) => row.tokens)));
</script>

<section class="card preset-filled-surface-100-900 flex min-w-0 flex-col gap-3 p-4">
  <header class="flex flex-wrap items-baseline justify-between gap-2">
    <h2 class="text-base font-semibold">Visits per day</h2>
    <span class="text-surface-600-400 text-xs">{count(total)} visitors</span>
  </header>

  {#if rows.length === 0}
    <p class="text-surface-600-400 py-4 text-center text-sm">No sessions in this range yet.</p>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each rows as row (row.label)}
        <li class="flex items-center gap-2 text-sm">
          <span class="w-10 shrink-0 text-right tabular-nums">{row.label}</span>
          <span class="bg-surface-200-800 h-2 grow overflow-hidden rounded-full">
            <span class="bg-primary-500 block h-full rounded-full" style="width: {(row.tokens / peak) * 100}%"></span>
          </span>
          <span class="w-20 shrink-0 text-right text-xs tabular-nums">
            {count(row.tokens)}<span class="text-surface-600-400"> · {percent(row.tokens / Math.max(1, total))}</span>
          </span>
        </li>
      {/each}
    </ul>
  {/if}

  <p class="text-surface-600-400 text-xs">Sessions opened by one daily token on one day. Nothing here links two days together.</p>
</section>
