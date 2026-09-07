<script lang="ts">
  import { presenceService } from "@tutors/community";
  import { currentCourse, tutorsId } from "@tutors/runes";
  import { t } from "@tutors/i18n";

  const course = $derived(currentCourse.value);
  let title = $state("");
  let description = $state("");
  let actionUrl = $state("");
  let actionLabel = $state("");
  let feedback = $state<{ kind: "sent" | "limited" | "error"; message: string } | null>();

  const feedbackClass = $derived(
    feedback === null
      ? ""
      : feedback.kind === "error"
        ? "bg-error-500/10 text-error-600"
        : feedback.kind === "limited"
          ? "bg-warning-500/10 text-warning-600"
          : "bg-success-500/10 text-success-600"
  );

  function reset() {
    title = "";
    description = "";
    actionUrl = "";
    actionLabel = "";
    feedback = null;
  }

  function onSubmit(event: Event) {
    event.preventDefault();
    const courseId = course?.courseId;
    if (!courseId) {
      feedback = { kind: "error", message: t("broadcast.limitedHint") };
      return;
    }

    const senderName = tutorsId.value?.name || tutorsId.value?.login || "Tutor";
    const sent = presenceService.sendCourseBroadcast(
      courseId,
      {
        title: title.trim(),
        description: description.trim(),
        actionUrl: actionUrl.trim() || undefined,
        actionLabel: actionLabel.trim() || undefined
      },
      senderName
    );

    if (!sent) {
      feedback = { kind: "limited", message: t("broadcast.limitedHint") };
      return;
    }

    feedback = { kind: "sent", message: t("broadcast.sentMessage") };
    reset();
  }
</script>

{#if feedback}
  <div
    role="status"
    class="mb-2 rounded-lg px-3 py-2 text-sm {feedbackClass}">
    {feedback.message}
  </div>
{/if}

<form class="space-y-3 p-2" onsubmit={onSubmit}>
  <p class="text-sm text-surface-500">{t("broadcast.subtitle")}</p>

  <div>
    <label class="label mb-1 font-semibold" for="broadcast-title">{t("broadcast.fieldTitle")}</label>
    <input
      id="broadcast-title"
      class="input w-full rounded-sm"
      type="text"
      placeholder={t("broadcast.fieldTitlePlaceholder")}
      maxlength={80}
      bind:value={title}
      required
    />
    <p class="mt-1 text-sm text-surface-500">{t("broadcast.fieldTitleHint")}</p>
  </div>

  <div>
    <label class="label mb-1 font-semibold" for="broadcast-desc">{t("broadcast.fieldDescription")}</label>
    <textarea
      id="broadcast-desc"
      class="input w-full rounded-sm min-h-[3rem]"
      rows="2"
      placeholder={t("broadcast.fieldDescriptionPlaceholder")}
      maxlength={280}
      bind:value={description}
      required
    ></textarea>
    <p class="mt-1 text-sm text-surface-500">{t("broadcast.fieldDescriptionHint")}</p>
  </div>

  <details>
    <summary class="mt-2 cursor-pointer text-sm text-surface-600">{t("broadcast.fieldActionUrl")}</summary>
    <div class="mt-2 space-y-2">
      <input
        class="input w-full rounded-sm"
        type="url"
        placeholder={t("broadcast.fieldActionUrlPlaceholder")}
        bind:value={actionUrl}
      />
      <input
        class="input w-full rounded-sm"
        type="text"
        placeholder={t("broadcast.fieldActionLabelPlaceholder")}
        maxlength={24}
        bind:value={actionLabel}
      />
      <p class="text-sm text-surface-500">{t("broadcast.fieldActionUrlHint")}</p>
    </div>
  </details>

  <div class="flex justify-end pt-1">
    <button class="btn rounded-sm bg-primary-500 text-white hover:bg-primary-600" type="submit">
      {t("broadcast.send")}
    </button>
  </div>
</form>
