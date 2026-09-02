<script lang="ts">
  import { currentCourse } from "@tutors/runes";
  import { onCourseBroadcast, type CourseBroadcast } from "@tutors/community";
  import { toaster, BROADCAST_TOAST_DURATION } from "@tutors/ui-primitives/utils/toaster";
  import { t } from "@tutors/i18n";

  function showBroadcast(broadcast: CourseBroadcast) {
    const sender =
      broadcast.senderName && broadcast.senderName !== "Anon" ? broadcast.senderName : null;
    const title = sender ? `${sender}: ${t("broadcast.receivedToast")}` : t("broadcast.receivedToast");
    toaster.create({
      type: "info",
      title,
      description: broadcast.description,
      duration: BROADCAST_TOAST_DURATION,
      meta: {
        actionUrl: broadcast.actionUrl,
        actionLabel: broadcast.actionLabel ?? t("broadcast.actionDefault")
      }
    });
  }

  $effect(() => {
    const courseId = currentCourse.value?.courseId;
    if (!courseId) return;
    const stop = onCourseBroadcast(courseId, showBroadcast);
    return stop;
  });
</script>
