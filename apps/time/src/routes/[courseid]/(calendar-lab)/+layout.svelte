<script lang="ts">
  import PinDialog from "$lib/components/PinDialog.svelte";
  import type { TutorsTimeCourse } from "@tutors/tutors-time-lib";

  interface Props {
    data: { course: TutorsTimeCourse | null };
    children: import("svelte").Snippet;
  }

  let { data, children }: Props = $props();
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

<div class="flex-1 min-h-0 flex flex-col h-full">
  {@render children()}
</div>
