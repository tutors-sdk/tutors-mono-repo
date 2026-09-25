<script lang="ts">
  import PinDialog from "$lib/components/PinDialog.svelte";
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

<div class="flex-1 min-h-0 flex flex-col h-full">
  {#if data.signInUrl}
    <!-- The reader answered 401: time data is only shown to someone signed in to the reader. -->
    <p class="p-4" role="status">Sign in to Tutors to see this course's time data. <a class="underline" href={data.signInUrl}>Sign in</a>, then come back to this page.</p>
  {:else}
    {@render children()}
  {/if}
</div>
