<script lang="ts">
  import { Dialog, Portal } from "@skeletonlabs/skeleton-svelte";
  import { browser } from "$app/environment";
  import { t } from "@tutors/i18n";
  import { currentCourse, currentLo, tutorsId } from "@tutors/runes";
  import { toaster } from "@tutors/ui-primitives/utils/toaster";
  import { PUBLIC_ANON_MODE } from "$env/static/public";

  const enabled = PUBLIC_ANON_MODE !== "TRUE";

  let open = $state(false);
  let filename = $state("");
  let title = $state("");
  let content = $state("");
  let creating = $state(false);
  let errorMessage = $state<string | null>(null);

  /** Show the button, but only to a signed-in student in a loaded course. */
  const show = $derived(
    enabled &&
      (browser ? true : false) &&
      !!tutorsId.value?.login &&
      !!currentCourse.value?.courseId
  );

  function reset() {
    const lo = currentLo.value;
    filename = lo ? lo.title.replace(/[^\w.-]+/g, "_").slice(0, 60) + ".txt" : "snippet.txt";
    title = lo?.title ?? "";
    content = "";
    errorMessage = null;
  }

  async function submit() {
    if (creating) return;
    if (!content.trim()) {
      errorMessage = t("gist.content");
      return;
    }
    creating = true;
    errorMessage = null;

    const courseId = currentCourse.value?.courseId ?? "";
    const lo = currentLo.value;
    try {
      const res = await fetch("/api/gists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          filename: filename.trim() || "snippet.txt",
          content,
          title: title.trim(),
          loRoute: lo?.route ?? "",
          loTitle: lo?.title ?? ""
        })
      });
      const data = (await res.json().catch(() => ({}))) as { gistUrl?: string; message?: string };

      if (!res.ok) {
        errorMessage = data.message ?? t("gist.error");
        toaster.create({
          type: "error",
          title: t("gist.error"),
          description: data.message ?? t("gist.error")
        });
        creating = false;
        return;
      }

      open = false;
      toaster.create({
        type: "success",
        title: t("gist.success"),
        description: data.gistUrl ?? "",
        meta: { actionUrl: data.gistUrl, actionLabel: t("gist.viewGist") }
      });
    } catch {
      errorMessage = t("gist.error");
      toaster.create({ type: "error", title: t("gist.error") });
    } finally {
      creating = false;
    }
  }
</script>

{#if show}
  <div class="fixed bottom-6 right-6 z-40">
    <button
      type="button"
      class="btn preset-filled rounded-full shadow-lg px-5"
      onclick={() => {
        reset();
        open = true;
      }}
      aria-haspopup="dialog"
    >
      {t("gist.button")}
    </button>
  </div>

  <Dialog {open} closeOnInteractOutside={false} closeOnEscape={true}>
    <Portal>
      <Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50 backdrop-blur-sm" />
      <Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Dialog.Content class="card bg-surface-100-900 w-full max-w-lg p-6 space-y-4 shadow-xl">
          <Dialog.Title class="text-xl font-bold text-center">
            {t("gist.modalTitle")}
          </Dialog.Title>
          <Dialog.Description class="text-surface-600 text-sm text-center">
            {t("gist.modalSubtitle")}
          </Dialog.Description>

          <div class="space-y-4">
            <div>
              <label class="label" for="gist-filename">{t("gist.filename")}</label>
              <input
                id="gist-filename"
                class="input w-full"
                bind:value={filename}
                placeholder={t("gist.filenamePlaceholder")}
              />
            </div>
            <div>
              <label class="label" for="gist-title">{t("gist.description")}</label>
              <input
                id="gist-title"
                class="input w-full"
                bind:value={title}
                placeholder={t("gist.descriptionPlaceholder")}
              />
            </div>
            <div>
              <label class="label" for="gist-content">{t("gist.content")}</label>
              <textarea
                id="gist-content"
                class="textarea w-full h-48"
                bind:value={content}
                placeholder={t("gist.contentPlaceholder")}
              ></textarea>
            </div>
            <p class="text-xs text-surface-500">{t("gist.warn")}</p>
            {#if errorMessage}
              <p class="text-sm text-error-500">{errorMessage}</p>
            {/if}
          </div>

          <div class="flex justify-end gap-2">
            <button type="button" class="btn preset-outlined" onclick={() => (open = false)}>
              {t("gist.cancel")}
            </button>
            <button
              type="button"
              class="btn preset-filled"
              disabled={creating}
              onclick={submit}
            >
              {creating ? t("gist.creating") : t("gist.share")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog>
{/if}
