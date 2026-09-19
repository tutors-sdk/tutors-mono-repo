<script lang="ts">
  import { onMount } from "svelte";
  import { Tabs } from "@skeletonlabs/skeleton-svelte";
  import { liveService } from "@tutors/community";
  import Courses from "@tutors/ui-components/time/Courses.svelte";
  import CoursesGroup from "@tutors/ui-components/time/CoursesGroup.svelte";
  import Students from "@tutors/ui-components/time/Students.svelte";
  import type { ActivityResponse, HeatmapMatrix, NowSnapshot, Observation, RangeName, StatsResponse } from "@tutors/live-store";
  import { fetchActivity, fetchCourses, fetchHeatmap, fetchNow, fetchObservations, fetchStats, subscribeNow } from "$lib/client/live-api";
  import { count, duration, percent, since } from "$lib/format";
  import ActiveSessions from "$lib/components/ActiveSessions.svelte";
  import CourseActivityTable from "$lib/components/CourseActivityTable.svelte";
  import HeatMap from "$lib/components/HeatMap.svelte";
  import RepeatVisits from "$lib/components/RepeatVisits.svelte";
  import NowPanel from "$lib/components/NowPanel.svelte";
  import ObservationCards from "$lib/components/ObservationCards.svelte";
  import PrivacyNote from "$lib/components/PrivacyNote.svelte";
  import RangeSwitch from "$lib/components/RangeSwitch.svelte";
  import Sparkline from "$lib/components/Sparkline.svelte";
  import StatTile from "$lib/components/StatTile.svelte";

  /**
   * The dashboard, in the three layers the plan asks for: Now from the hot
   * store over SSE, Recent and Trend from the rollups behind the range switch.
   */

  let range = $state<RangeName>("7d");
  let course = $state<string | null>(null);
  let courses = $state<string[]>([]);

  let now = $state<NowSnapshot | null>(null);
  let connected = $state(false);
  let stats = $state<StatsResponse | null>(null);
  let activity = $state<ActivityResponse | null>(null);
  let serviceHeat = $state<HeatmapMatrix | null>(null);
  let courseHeat = $state<HeatmapMatrix | null>(null);
  let observations = $state<Observation[]>([]);
  let failure = $state<string | null>(null);

  async function loadRange(selected: RangeName, selectedCourse: string | null): Promise<void> {
    try {
      const [nextStats, nextActivity, nextService, nextCourse, nextObservations] = await Promise.all([
        fetchStats(selected, selectedCourse),
        fetchActivity(selected, selectedCourse),
        fetchHeatmap("service", selected, selectedCourse),
        fetchHeatmap("course", selected, selectedCourse),
        fetchObservations(selected)
      ]);
      stats = nextStats;
      activity = nextActivity;
      serviceHeat = nextService;
      courseHeat = nextCourse;
      observations = nextObservations;
      failure = null;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
  }

  // The presence service is the older Supabase view, kept below the new panels.
  liveService.startGlobalPresenceService();

  onMount(() => {
    fetchCourses()
      .then((found) => (courses = found))
      .catch(() => (courses = []));
    fetchNow()
      .then((snapshot) => {
        now = snapshot;
        connected = true;
      })
      .catch(() => (connected = false));

    const stop = subscribeNow(
      (snapshot) => {
        now = snapshot;
        connected = true;
      },
      () => (connected = false)
    );
    return stop;
  });

  $effect(() => {
    void loadRange(range, course);
  });
</script>

<svelte:head>
  <title>Tutors Live - stats and heat maps</title>
</svelte:head>

<div class="flex w-full min-w-0 flex-col gap-4 p-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-baseline gap-3">
      <h1 class="text-xl font-semibold">Tutors Live</h1>
      <span class="text-surface-600-400 flex items-center gap-1 text-xs">
        <span
          class="inline-block size-2 rounded-full {connected ? 'bg-success-500 animate-pulse' : 'bg-surface-400-600'}"
          aria-hidden="true"
        ></span>
        {connected ? "live" : "reconnecting"}
      </span>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <label class="sr-only" for="course-filter">Course</label>
      <select id="course-filter" class="select select-sm max-w-56" bind:value={course}>
        <option value={null}>All courses</option>
        {#each courses as id (id)}
          <option value={id}>{id}</option>
        {/each}
      </select>
      <RangeSwitch value={range} onchange={(next) => (range = next)} />
    </div>
  </header>

  {#if failure}
    <aside class="card preset-outlined-warning-500 p-3 text-sm">
      The live API did not answer: {failure}. The panels below show whatever was last loaded.
    </aside>
  {/if}

  <section class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
    <StatTile label="Active now" value={count(now?.activeSessions ?? 0)} hint="sessions in the last 2 minutes" live />
    <StatTile label="Sessions" value={count(stats?.stats.sessions ?? 0)} hint="completed in range" />
    <StatTile label="Unique sessions" value={count(stats?.stats.uniqueSessions ?? 0)} hint="distinct daily tokens" />
    <StatTile label="Views" value={count(stats?.stats.views ?? 0)} hint="learning objects opened" />
    <StatTile
      label="Session length"
      value={duration(stats?.stats.medianSessionSec ?? 0)}
      hint="median · p90 {duration(stats?.stats.p90SessionSec ?? 0)}"
    />
    <StatTile label="Visitors" value={count(activity?.visitors ?? 0)} hint="{percent(activity?.returningRate ?? 0)} came back same day" />
    <StatTile label="Last activity" value={since(activity?.lastSeen)} hint="{count(stats?.stats.activeCourses ?? 0)} active courses" live />
  </section>

  <section class="grid grid-cols-1 gap-3 lg:grid-cols-3">
    <div class="lg:col-span-2 flex min-w-0 flex-col gap-3">
      {#if serviceHeat}
        <HeatMap matrix={serviceHeat} />
      {/if}
      {#if courseHeat}
        <HeatMap matrix={courseHeat} />
      {/if}
    </div>
    <div class="flex min-w-0 flex-col gap-3">
      <section class="card preset-filled-surface-100-900 flex min-w-0 flex-col gap-2 p-4">
        <h2 class="text-base font-semibold">Sessions and views</h2>
        <Sparkline series={stats?.series ?? []} />
      </section>
      <ObservationCards {observations} />
    </div>
  </section>

  <section class="grid grid-cols-1 gap-3 xl:grid-cols-3">
    <div class="xl:col-span-2 flex min-w-0 flex-col gap-3">
      <CourseActivityTable {activity} {range} />
      <ActiveSessions sessions={now?.sessions ?? []} />
    </div>
    <div class="flex min-w-0 flex-col gap-3">
      <RepeatVisits visits={activity?.repeatVisits ?? []} />
      <NowPanel snapshot={now} />
    </div>
  </section>

  <section class="card preset-filled-surface-100-900 p-4">
    <h2 class="mb-2 text-base font-semibold">Connected learners</h2>
    <Tabs defaultValue="Courses">
      <Tabs.List>
        <Tabs.Trigger value="Courses">Courses ({liveService.coursesOnline.value.length})</Tabs.Trigger>
        <Tabs.Trigger value="Students">Students ({liveService.studentsOnline.value.length})</Tabs.Trigger>
        <Tabs.Trigger value="Groups">Groups</Tabs.Trigger>
        <Tabs.Indicator />
      </Tabs.List>
      <Tabs.Content value="Courses"><Courses /></Tabs.Content>
      <Tabs.Content value="Students"><Students /></Tabs.Content>
      <Tabs.Content value="Groups"><CoursesGroup /></Tabs.Content>
    </Tabs>
  </section>

  <PrivacyNote />
</div>
