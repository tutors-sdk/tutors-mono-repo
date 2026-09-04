<script lang="ts">
  import { onDestroy } from "svelte";
  import { supabase } from "@tutors/community";
  import { toaster, BROADCAST_TOAST_DURATION } from "@tutors/ui-primitives/utils/toaster";

  interface Props {
    /** The course this dashboard is for; changes rebind the subscription. */
    courseId: string;
  }

  let { courseId }: Props = $props();

  interface GistCreatedPayload {
    type: string;
    gistId?: string;
    gistUrl?: string;
    course_id?: string;
    student_id?: string;
    student_name?: string;
    title?: string;
    lo_route?: string;
    lo_title?: string;
    expires_at?: string;
  }

  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
  let boundCourseId = "";

  function showGistToast(payload: GistCreatedPayload) {
    const name = payload.student_name?.trim() || payload.student_id || "A student";
    const title = payload.title?.trim();
    const description = title ? `${name} shared "${title}"` : `${name} shared a snippet`;

    toaster.create({
      type: "info",
      title: "New snippet shared",
      description,
      duration: BROADCAST_TOAST_DURATION,
      meta: {
        actionUrl: payload.gistUrl,
        actionLabel: "View gist"
      }
    });
  }

  function bind() {
    const id = courseId?.trim();
    if (!supabase || !id) return;
    if (id === boundCourseId && channel) return;

    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
    boundCourseId = id;
    channel = supabase
      .channel(id, { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "gist-created" }, (msg: { payload?: unknown }) => {
        const payload = msg.payload as GistCreatedPayload | undefined;
        if (payload?.type === "gist-created") showGistToast(payload);
      })
      .subscribe();
  }

  $effect(() => {
    void courseId;
    bind();
  });

  onDestroy(() => {
    if (channel && supabase) supabase.removeChannel(channel);
  });
</script>
