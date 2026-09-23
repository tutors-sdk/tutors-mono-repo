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
  <p class="ui-eyebrow">{t("shell.myTime")}</p>
  <h1 class="ui-title time-title">{t("time.title")}</h1>
  <p class="ui-muted">{t("time.description")}</p>
  <div class="time-body">
    {#if !tutorsId.value?.login}
      <div class="ui-empty ui-actions justify-between"><p>{t("time.signedOut")}</p><a class="ui-button ui-button-primary" href="/auth/{currentCourse.value?.courseId ?? ''}">{t("auth.signInWithGithub")}</a></div>
    {:else if isLoading}
      <p role="status">{t("shell.loading")}</p>
    {:else if failed}
      <div class="ui-empty" role="alert">{t("shell.loadError")} <button class="ui-button" onclick={() => retry++}>{t("shell.retry")}</button></div>
    {:else if studentCalendar}
      <HeatMaps {studentCalendar} />
      <Tables {studentCalendar} />
    {:else}
      <p class="ui-empty">{t("time.noRecords")}</p>
    {/if}
  </div>
</div>

<style>
  .time-title { margin-block: var(--space-2); }
  .time-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-6); margin-top: var(--space-8); }
</style>
