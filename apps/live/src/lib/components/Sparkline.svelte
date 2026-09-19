<script lang="ts">
  import type { SeriesPoint } from "@tutors/live-store";
  import { count, shortDay } from "$lib/format";

  /**
   * Sessions and views per day. Two lines on one axis pair would lie about the
   * relationship between them, so each is drawn against its own maximum and the
   * legend carries the totals.
   */
  interface Props {
    series: SeriesPoint[];
    height?: number;
  }
  let { series, height = 56 }: Props = $props();

  const width = 320;
  const points = $derived(series.length);
  const totals = $derived({
    sessions: series.reduce((sum, point) => sum + point.sessions, 0),
    views: series.reduce((sum, point) => sum + point.views, 0)
  });

  function path(values: number[]): string {
    if (values.length === 0) return "";
    const max = Math.max(...values, 1);
    const step = values.length > 1 ? width / (values.length - 1) : 0;
    return values
      .map((value, index) => `${index === 0 ? "M" : "L"} ${(index * step).toFixed(1)} ${(height - (value / max) * (height - 4) - 2).toFixed(1)}`)
      .join(" ");
  }
</script>

{#if points === 0}
  <p class="text-surface-600-400 text-sm">Nothing recorded yet.</p>
{:else}
  <div class="flex min-w-0 flex-col gap-1">
    <svg viewBox="0 0 {width} {height}" {height} class="w-full" role="img" aria-label="Sessions and views per day">
      <path d={path(series.map((point) => point.views))} fill="none" class="stroke-tertiary-500" stroke-width="1.5" stroke-opacity="0.7" />
      <path d={path(series.map((point) => point.sessions))} fill="none" class="stroke-primary-500" stroke-width="2" />
    </svg>
    <div class="text-surface-600-400 flex flex-wrap justify-between gap-2 text-xs">
      <span><span class="text-primary-500 font-semibold">{count(totals.sessions)}</span> sessions</span>
      <span>{shortDay(series[0].day)} - {shortDay(series[points - 1].day)}</span>
      <span><span class="text-tertiary-500 font-semibold">{count(totals.views)}</span> views</span>
    </div>
  </div>
{/if}
