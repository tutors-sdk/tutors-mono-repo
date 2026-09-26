<script lang="ts">
  import { onMount } from "svelte";
  import {
    LoRecord,
    presenceService,
    type TutorsConnectLatestRow,
    getTutorsConnectLatestLosByCourseId,
    isReceivedAtInLocalMonth,
    isReceivedAtInLocalWeek,
    isReceivedAtInLocalYear,
    isReceivedAtOnLocalDay
  } from "@tutors/community";
  import ConnectLatestLosCards from "@tutors/ui-components/time/ConnectLatestLosCards.svelte";
  import { Tabs } from "@skeletonlabs/skeleton-svelte";
  import { t } from "@tutors/i18n";
  import SecondaryNavigator from "@tutors/ui-navigators/SecondaryNavigator.svelte";
  import type { Course } from "@tutors/tutors-model-lib";

  interface Props {
    data: { courseid: string; course: Course };
  }
  let { data }: Props = $props();

  let connectRows = $state<TutorsConnectLatestRow[]>([]);

  function toVisibleLos(rows: TutorsConnectLatestRow[]): LoRecord[] {
    return rows.map((r) => new LoRecord(r.payload)).filter((lo) => lo?.user?.fullName !== "Anon");
  }

  const losThisDay = $derived.by(() => {
    const ref = new Date();
    return toVisibleLos(connectRows.filter((r) => isReceivedAtOnLocalDay(r.received_at, ref)));
  });

  const losThisWeek = $derived.by(() => {
    const ref = new Date();
    return toVisibleLos(connectRows.filter((r) => isReceivedAtInLocalWeek(r.received_at, ref) && !isReceivedAtOnLocalDay(r.received_at, ref)));
  });

  const losThisMonth = $derived.by(() => {
    const ref = new Date();
    return toVisibleLos(connectRows.filter((r) => isReceivedAtInLocalMonth(r.received_at, ref) && !isReceivedAtInLocalWeek(r.received_at, ref)));
  });

  const losThisYear = $derived.by(() => {
    const ref = new Date();
    return toVisibleLos(connectRows.filter((r) => isReceivedAtInLocalYear(r.received_at, ref) && !isReceivedAtInLocalMonth(r.received_at, ref)));
  });

  const studentsOnlineVisible = $derived(presenceService.studentsOnline.value.filter((lo) => lo?.user?.fullName !== "Anon"));

  onMount(async () => {
    const courseid = data.courseid;
    if (!courseid) return;

    if (presenceService.listeningTo !== courseid) {
      presenceService.startPresenceListener(courseid);
    }
    connectRows = await getTutorsConnectLatestLosByCourseId(courseid);
  });
</script>

<SecondaryNavigator home={{ title: t("home.live"), route: "/" }} lo={{ breadCrumbs: [{ title: data.course.title, route: `/${data.courseid}` }] }} />
<div class="ui-page">
  <header class="live-header">
    <div>
      <p class="ui-eyebrow">{t("home.live")}</p>
      <h1 class="ui-title">{data.course.title}</h1>
      <p class="ui-muted">{t("live.courseSummary")}</p>
    </div>
    <a class="ui-button" target="_blank" rel="noopener noreferrer" href="https://tutors.dev/course/{data.course.courseId}">{t("live.openCourse")} <span aria-hidden="true">↗</span></a>
  </header>

  <div class="live-body">
    <section class="ui-panel">
      <h2 class="ui-section-title">{t("live.onlineNow")}</h2>
      <ConnectLatestLosCards los={studentsOnlineVisible} emptyMessage={t("live.emptyOnline")} />
    </section>

    <section class="ui-panel">
      <h2 class="ui-section-title">{t("live.latestActivity")}</h2>
      <Tabs defaultValue="Day">
        <Tabs.List>
          <Tabs.Trigger value="Day">{t("live.today")}</Tabs.Trigger>
          <Tabs.Trigger value="Week">{t("live.thisWeek")}</Tabs.Trigger>
          <Tabs.Trigger value="Month">{t("live.thisMonth")}</Tabs.Trigger>
          <Tabs.Trigger value="Year">{t("live.thisYear")}</Tabs.Trigger>
          <Tabs.Indicator />
        </Tabs.List>
        <Tabs.Content value="Day"><ConnectLatestLosCards los={losThisDay} emptyMessage={t("live.emptyToday")} /></Tabs.Content>
        <Tabs.Content value="Week"><ConnectLatestLosCards los={losThisWeek} emptyMessage={t("live.emptyWeek")} /></Tabs.Content>
        <Tabs.Content value="Month"><ConnectLatestLosCards los={losThisMonth} emptyMessage={t("live.emptyMonth")} /></Tabs.Content>
        <Tabs.Content value="Year"><ConnectLatestLosCards los={losThisYear} emptyMessage={t("live.emptyYear")} /></Tabs.Content>
      </Tabs>
    </section>
  </div>
</div>

<style>
  .live-header { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-4) var(--space-6); }
  .live-header > div { min-width: 0; }
  .live-header .ui-title, .live-header .ui-muted { margin-top: var(--space-2); }
  .live-body { display: grid; gap: var(--space-6); margin-top: var(--space-8); }
  .ui-section-title { margin-bottom: var(--space-4); }
</style>
