<script lang="ts">
  import { page } from "$app/stores";
  import PinDialog from "$lib/components/PinDialog.svelte";
  import GistListener from "$lib/components/GistListener.svelte";
  import type { TutorsTimeCourse } from "@tutors/tutors-time-lib";

  interface Props {
    data: { course: TutorsTimeCourse | null; isEducator: boolean };
    children: import("svelte").Snippet;
  }

  let { data, children }: Props = $props();
  let showPinDialog = $state(true);

  const courseId = $derived(($page.params.courseid as string) ?? "");

  /**
   * The snippet dashboard is exempt from the PIN.
   *
   * The PIN is a course-wide shared secret guarding class analytics from a
   * projector; the dashboard is authorised per-user, server-side, against
   * `enrollment.educators` before it returns a single row. Stacking the weaker
   * gate on top of the stronger one bought nothing and meant an educator
   * following the link from the reader hit a prompt in front of a page that had
   * already decided they were allowed in.
   *
   * Matched on route id, not pathname: a course id may itself end in "gists".
   */
  const pinRequired = $derived(!$page.route.id?.endsWith("/gists"));

  function onVerified() {
    showPinDialog = false;
  }
</script>

{#if pinRequired}
  <PinDialog
    open={showPinDialog}
    pin={data.course?.pin ?? ""}
    sessionKey={data.course?.id}
    onVerified={onVerified}
  />
{/if}

<!--
  Snippet toasts are for educators only. Previously this was mounted in
  [courseid]/+layout.svelte — outside every gate — so anyone who opened a
  course URL received them.
-->
{#if data.isEducator}
  <GistListener {courseId} />
{/if}

<div class="flex-1 min-h-0 flex flex-col h-full">
  {@render children()}
</div>
