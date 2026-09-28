<script lang="ts">
  import type { TutorsTimeStudent } from "@tutors/tutors-time-lib";
  import PinDialog from "$lib/components/PinDialog.svelte";
  import HeatMaps from "@tutors/ui-components/time/HeatMaps.svelte";
  import Tables from "@tutors/ui-components/time/Tables.svelte";
  import { t } from "@tutors/i18n";
  import { invalidateAll } from "$app/navigation";

  interface Props {
    data: { course: { id: string; pin: string } | null; studentCalendar: TutorsTimeStudent };
  }

  let { data }: Props = $props();
  let showPinDialog = $state(true);

  function onVerified() {
    showPinDialog = false;
  }
</script>

<PinDialog
  open={showPinDialog}
  pin={data.course?.pin ?? ""}
  sessionKey={data.course?.id}
  onVerified={onVerified}
/>

<svelte:head>
  <title>Student Calendar</title>
  <meta name="description" content="Single-student calendar view for a specific course" />
</svelte:head>

{#if data.studentCalendar?.error}
  <div class="ui-empty" role="alert">{t("shell.loadError")} <button class="ui-button" onclick={() => invalidateAll()}>{t("shell.retry")}</button></div>
{:else if data.studentCalendar && !data.studentCalendar.hasData}
  <p class="ui-empty">{t("classTime.noStudentData")}</p>
{:else if data.studentCalendar}
  <HeatMaps studentCalendar={data.studentCalendar} />
  <Tables studentCalendar={data.studentCalendar} />
{/if}
