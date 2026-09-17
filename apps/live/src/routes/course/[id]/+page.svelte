<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import type { HeatmapMatrix, NowSnapshot, RangeName, StatsResponse } from "@tutors/live-store";
  import { fetchHeatmap, fetchNow, fetchStats, subscribeNow } from "$lib/client/live-api";
  import { count, duration, loLabel } from "$lib/format";
  import HeatMap from "$lib/components/HeatMap.svelte";
  import PrivacyNote from "$lib/components/PrivacyNote.svelte";
  import RangeSwitch from "$lib/components/RangeSwitch.svelte";
  import Sparkline from "$lib/components/Sparkline.svelte";
  import StatTile from "$lib/components/StatTile.svelte";

  /**
   * One course, in the same three layers as the dashboard: who is on it now and
   * on which learning object, how it has moved over the range, what it leans on.
   */

  const courseId = $derived(page.params.id ?? "");

  let range = $state<RangeName>("7d");
  let stats = $state<StatsResponse | null>(null);
  let heat = $state<HeatmapMatrix | null>(null);
  let now = $state<NowSnapshot | null>(null);
  let failure = $state<string | null>(null);

  const here = $derived(now?.courses.find((entry) => entry.course === courseId) ?? null);
  const mix = $derived((stats?.serviceMix ?? []).filter((entry) => entry.touches > 0));

  async function load(selected: RangeName, id: string): Promise<void> {
    if (!id) return;
    try {
      const [nextStats, nextHeat] = await Promise.all([fetchStats(selected, id), fetchHeatmap("service-monthly", selected, id)]);
      stats = nextStats;
      heat = nextHeat;
      failure = null;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
  }

  onMount(() => {
    fetchNow()
      .then((snapshot) => (now = snapshot))
      .catch(() => undefined);
    return subscribeNow(
      (snapshot) => (now = snapshot),
      () => undefined
    );
  });

  $effect(() => {
    void load(range, courseId);
  });
</script>

<svelte:head>
  <title>{courseId} - Tutors Live</title>
</svelte:head>

<div class="flex w-full min-w-0 flex-col gap-4 p-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex flex-col">
      <a class="anchor text-xs" href="/">All courses</a>
      <h1 class="text-xl font-semibold">{courseId}</h1>
    </div>
    <RangeSwitch value={range} onchange={(next) => (range = next)} />
  </header>

  {#if failure}
    <aside class="card preset-outlined-warning-500 p-3 text-sm">The live API did not answer: {failure}.</aside>
  {/if}

  <section class="grid grid-cols-2 gap-3 md:grid-cols-4">
    <StatTile label="Active now" value={count(here?.active ?? 0)} hint="sessions in the last 2 minutes" live />
    <StatTile label="Sessions" value={count(stats?.stats.sessions ?? 0)} hint="completed in range" />
    <StatTile label="Views" value={count(stats?.stats.views ?? 0)} hint="learning objects opened" />
    <StatTile
      label="Session length"
      value={duration(stats?.stats.medianSessionSec ?? 0)}
      hint="median · p90 {duration(stats?.stats.p90SessionSec ?? 0)}"
    />
  </section>

  <section class="grid grid-cols-1 gap-3 lg:grid-cols-2">
    <section class="card preset-filled-surface-100-900 flex min-w-0 flex-col gap-3 p-4">
      <h2 class="text-base font-semibold">Reading right now</h2>
      {#if !here || here.los.length === 0}
        <p class="text-surface-600-400 py-4 text-center text-sm">Nobody is on this course right now.</p>
      {:else}
        <ul class="flex flex-col gap-1">
          {#each here.los as lo (lo.lo)}
            <li class="flex items-baseline justify-between gap-2 text-sm">
              <span class="truncate" title={lo.lo}>{loLabel(lo.lo)}</span>
              <span class="badge preset-filled-success-500 shrink-0">{lo.count}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="card preset-filled-surface-100-900 flex min-w-0 flex-col gap-2 p-4">
      <h2 class="text-base font-semibold">Sessions and views</h2>
      <Sparkline series={stats?.series ?? []} />
    </section>
  </section>

  <section class="grid grid-cols-1 gap-3 lg:grid-cols-2">
    <section class="card preset-filled-surface-100-900 flex min-w-0 flex-col gap-3 p-4">
      <h2 class="text-base font-semibold">Top labs and topics</h2>
      {#if !stats?.topLos || stats.topLos.length === 0}
        <p class="text-surface-600-400 py-4 text-center text-sm">No learning objects opened in this range yet.</p>
      {:else}
        <div class="table-wrap">
          <table class="table table-fixed text-sm">
            <thead>
              <tr><th class="w-1/2">Learning object</th><th>Type</th><th class="text-right">Views</th></tr>
            </thead>
            <tbody>
              {#each stats.topLos as lo (lo.lo)}
                <tr>
                  <td class="truncate" title={lo.lo}>{loLabel(lo.lo)}</td>
                  <td class="truncate">{lo.loType}</td>
                  <td class="text-right tabular-nums">{count(lo.views)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <section class="card preset-filled-surface-100-900 flex min-w-0 flex-col gap-3 p-4">
      <h2 class="text-base font-semibold">Service mix</h2>
      {#if mix.length === 0}
        <p class="text-surface-600-400 py-4 text-center text-sm">No service touches in this range yet.</p>
      {:else}
        <ul class="flex flex-col gap-2">
          {#each mix as entry (entry.service)}
            <li class="flex items-center gap-2 text-sm">
              <span class="w-24 shrink-0 truncate">{entry.service}</span>
              <span class="bg-surface-200-800 h-2 grow overflow-hidden rounded-full">
                <span class="bg-primary-500 block h-full rounded-full" style="width: {(entry.touches / mix[0].touches) * 100}%"></span>
              </span>
              <span class="w-12 shrink-0 text-right tabular-nums">{count(entry.touches)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </section>

  {#if heat}
    <HeatMap matrix={heat} title="Service usage by day on {courseId}" />
  {/if}

  <PrivacyNote />
</div>
