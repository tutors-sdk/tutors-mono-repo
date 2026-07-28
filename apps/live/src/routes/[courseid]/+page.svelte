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
  import CourseGroupHeader from "@tutors/ui-components/time/CourseGroupHeader.svelte";
  import { Tabs } from "@skeletonlabs/skeleton-svelte";
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

<div class="flex w-full min-w-0 flex-col gap-4 pb-4">
  <section class="bg-surface-100-800-token border-surface-200-700-token w-full min-w-0 overflow-hidden p-4">
    <div class="flex flex-wrap justify-center">
      <div class="border-surface-300-600-token mb-2 w-full">
        <CourseGroupHeader courseId={data.course.courseId!} courseTitle={data.course.title!} />
      </div>
      <h2 class="border-surface-300-600-token mb-3 w-full border-b pb-2 text-lg font-semibold">Online Now</h2>
      <ConnectLatestLosCards
        los={studentsOnlineVisible}
        emptyMessage="No students currently online"
      />
    </div>
  </section>

  <section class="bg-surface-100-800-token border-surface-200-700-token w-full min-w-0 overflow-hidden p-4">
    <h2 class="border-surface-300-600-token mb-3 border-b pb-2 text-lg font-semibold">Latest Activity</h2>
    <Tabs defaultValue="Day">
      <Tabs.List>
        <Tabs.Trigger value="Day">Today</Tabs.Trigger>
        <Tabs.Trigger value="Week">This Week</Tabs.Trigger>
        <Tabs.Trigger value="Month">This Month</Tabs.Trigger>
        <Tabs.Trigger value="Year">This Year</Tabs.Trigger>
        <Tabs.Indicator />
      </Tabs.List>
      <Tabs.Content value="Day">
        <ConnectLatestLosCards
          los={losThisDay}
          emptyMessage="No activity today"
        />
      </Tabs.Content>
      <Tabs.Content value="Week">
        <ConnectLatestLosCards
          los={losThisWeek}
          emptyMessage="No activity this week"
        />
      </Tabs.Content>
      <Tabs.Content value="Month">
        <ConnectLatestLosCards
          los={losThisMonth}
          emptyMessage="No activity this month"
        />
      </Tabs.Content>
      <Tabs.Content value="Year">
        <ConnectLatestLosCards
          los={losThisYear}
          emptyMessage="No activity this year"
        />
      </Tabs.Content>
    </Tabs>
  </section>
</div>
