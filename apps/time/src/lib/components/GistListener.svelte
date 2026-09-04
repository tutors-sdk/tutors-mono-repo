<script lang="ts">
  import { onDestroy } from "svelte";
  import { onGistCreated, type GistCreatedEvent } from "@tutors/community";
  import { toaster, BROADCAST_TOAST_DURATION } from "@tutors/ui-primitives/utils/toaster";

  interface Props {
    /** The course this dashboard is for; changes rebind the subscription. */
    courseId: string;
  }

  let { courseId }: Props = $props();

  function showGistToast(event: GistCreatedEvent) {
    const name = (event.student_name ?? event.student_id ?? "").trim() || "A student";
    const title = (event.title ?? "").trim();
    const description = title ? `${name} shared \u201C${title}\u201D` : `${name} shared a snippet`;

    toaster.create({
      type: "info",
      title: "New snippet shared",
      description,
      duration: BROADCAST_TOAST_DURATION,
      meta: {
        actionUrl: event.gistUrl,
        actionLabel: "View gist"
      }
    });
  }

  let stop: (() => void) | null = null;

  $effect(() => {
    const id = courseId.trim();
    if (!id) return;
    // onGistCreated guarantees exactly-once delivery per tab and is wired to
    // the shared per-course Supabase broadcast channel (set up via
    // presenceService's setGistSupabase on app import).
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
