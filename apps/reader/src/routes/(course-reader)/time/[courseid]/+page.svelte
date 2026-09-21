<script lang="ts">
  import { TutorsTime, type TutorsTimeStudent } from "@tutors/tutors-time-lib";
  import { t } from "@tutors/i18n";
  import { currentCourse, tutorsId } from "@tutors/runes";
  import HeatMaps from "./HeatMaps.svelte";
  import Tables from "./Tables.svelte";
  import SecondaryNavigator from "@tutors/ui-navigators/SecondaryNavigator.svelte";
  import type { PageData } from "./$types";
  import log from "@tutors/logger";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();

  let studentCalendar = $state<TutorsTimeStudent | null>(null);
  let isLoading = $state(false);
  let failed = $state(false);
  let retry = $state(0);

  // Reactive effect that reloads data when course or student changes
  $effect(() => {
    retry;
    const courseId = currentCourse.value?.courseId;
    const studentLogin = tutorsId.value?.login;

    if (!courseId || !studentLogin) return;

    isLoading = true;
    failed = false;
    TutorsTime.loadStudentTime(courseId, studentLogin, null, null)
      .then((data) => {
        studentCalendar = data;
      })
      .catch((error) => {
        log.error("Failed to load student calendar:", error);
        failed = true;
      })
      .finally(() => {
        isLoading = false;
      });
  });
</script>

<svelte:head>
  <title>Student Calendar</title>
  <meta name="description" content="Single-student calendar view for a specific course" />
</svelte:head>

<SecondaryNavigator lo={data?.lo} parentCourse={data.lo?.parentCourse?.properties?.parent} />
<div class="ui-page">
  <h1 class="ui-title mb-6">{t("shell.myTime")}</h1>
  {#if isLoading}<p role="status">{t("shell.loading")}</p>{/if}
  {#if failed}<div class="ui-empty" role="alert">{t("shell.loadError")} <button class="ui-button" onclick={() => retry++}>{t("shell.retry")}</button></div>{/if}
  <div class="ui-panel mb-6 overflow-x-auto">
    <HeatMaps {studentCalendar} />
  </div>
  <div class="ui-panel overflow-x-auto">
    <Tables {studentCalendar} />
  </div>
</div>
