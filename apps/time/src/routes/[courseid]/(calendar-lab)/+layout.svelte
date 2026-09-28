<script lang="ts">
  import PinDialog from "$lib/components/PinDialog.svelte";
  import { t } from "@tutors/i18n";
  import type { TutorsTimeCourse } from "@tutors/tutors-time-lib";

  interface Props {
    data: { course: TutorsTimeCourse | null; signInUrl?: string | null };
    children: import("svelte").Snippet;
  }

  let { data, children }: Props = $props();
  let showPinDialog = $state(true);

  function onVerified() {
    showPinDialog = false;
  }
</script>

<PinDialog
  open={showPinDialog && !data.signInUrl}
  pin={data.course?.pin ?? ""}
  sessionKey={data.course?.id}
  onVerified={onVerified}
/>

{#if data.signInUrl}
  <div class="ui-empty" role="status">{t("time.signedOut")} <a class="ui-button ui-button-primary" href={data.signInUrl}>{t("auth.signInWithGithub")}</a></div>
{:else}
  {@render children()}
{/if}
