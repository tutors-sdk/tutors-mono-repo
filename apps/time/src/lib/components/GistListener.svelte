<script lang="ts">
  import { onDestroy } from "svelte";
  import { onGistCreated } from "@tutors/community";
  import { toaster, BROADCAST_TOAST_DURATION } from "@tutors/ui-primitives/utils/toaster";

  interface Props {
    /** The course this dashboard is for; changes rebind the subscription. */
    courseId: string;
  }

  let { courseId }: Props = $props();

  /**
   * The realtime ping carries no snippet data — see gist-broadcast.ts. Supabase
   * broadcast rides the public anon key, so anything put on the wire is
   * readable by anyone. The toast therefore says only that *something* was
   * shared, and points at the authorised dashboard for the detail.
   */
  function showGistToast() {
    toaster.create({
      type: "info",
      title: "New snippet shared",
      description: "A student shared a snippet with this course.",
      duration: BROADCAST_TOAST_DURATION,
      meta: {
        actionUrl: `/${courseId}/gists`,
        actionLabel: "Open snippets"
      }
    });
  }

  let stop: (() => void) | null = null;

  $effect(() => {
    const id = courseId.trim();
    if (!id) return;
    stop = onGistCreated(id, showGistToast);
    return () => {
      stop?.();
      stop = null;
    };
  });

  onDestroy(() => {
    stop?.();
  });
</script>
