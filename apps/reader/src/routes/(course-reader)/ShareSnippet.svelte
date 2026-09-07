<script lang="ts">
  import { Dialog, Portal } from "@skeletonlabs/skeleton-svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { browser } from "$app/environment";
  import { t } from "@tutors/i18n";
  import { currentCourse, currentLo, tutorsId } from "@tutors/runes";
  import { sendGistCreated } from "@tutors/community";
  import { toaster } from "@tutors/ui-primitives/utils/toaster";
  import { PUBLIC_ANON_MODE } from "$env/static/public";

  const enabled = PUBLIC_ANON_MODE !== "TRUE";

  /** Mirrors MAX_CONTENT_BYTES in `/api/gists`, so the 413 is never a surprise. */
  const MAX_BYTES = 400 * 1000;

  let open = $state(false);
  let filename = $state("");
  let title = $state("");
  let content = $state("");
  let creating = $state(false);
  let errorMessage = $state<string | null>(null);

  const bytes = $derived(new TextEncoder().encode(content).byteLength);
  const tooLarge = $derived(bytes > MAX_BYTES);
  const canShare = $derived(!creating && content.trim().length > 0 && !tooLarge);

  const kb = (n: number) => `${(n / 1000).toFixed(n < 100 ? 1 : 0)} KB`;

  /** The learning object the snippet is filed against — what the tutor sees. */
  const attachedTo = $derived(currentLo.value?.title ?? "");

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
      errorMessage = t("gist.contentRequired");
      return;
    }
    if (tooLarge) {
      errorMessage = t("gist.tooLarge");
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
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        expiresAt?: string;
        message?: string;
      };

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
      // Ping the course's lecturer dashboard. Content-free by design — this
      // rides the public anon key, so the dashboard re-fetches the snippet
      // through its own authorised route instead.
      sendGistCreated(courseId);
      toaster.create({
        type: "success",
        title: t("gist.success"),
        description: t("gist.successMessage")
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
      class="btn gap-2 rounded-full bg-primary-500 px-5 text-white shadow-lg hover:bg-primary-600"
      onclick={() => {
        reset();
        open = true;
      }}
      aria-haspopup="dialog"
    >
      <Icon type="note" height="18" />
      {t("gist.button")}
    </button>
  </div>

  <Dialog {open} closeOnInteractOutside={false} closeOnEscape={true}>
    <Portal>
      <Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50 backdrop-blur-sm" />
      <Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Dialog.Content class="card bg-surface-100-900 flex max-h-[85vh] w-full max-w-2xl flex-col shadow-xl">
          <header class="flex items-start justify-between gap-4 border-b border-surface-200-800 p-4">
            <div class="min-w-0">
              <Dialog.Title class="text-lg font-bold">{t("gist.modalTitle")}</Dialog.Title>
              {#if attachedTo}
                <p class="text-surface-500 mt-0.5 truncate text-xs">
                  {t("gist.attachedTo")}
                  <span class="font-medium">{attachedTo}</span>
                </p>
              {/if}
            </div>
            <button
              type="button"
              class="hover:preset-tonal shrink-0 rounded-lg p-1"
              aria-label={t("gist.close")}
              onclick={() => (open = false)}
            >
              <Icon type="close" height="20" />
            </button>
          </header>

          <div class="flex-1 space-y-3 overflow-y-auto p-4">
            <!--
              Content leads. The student is here to paste an error, not to name
              a file — the other two fields are prefilled from the learning
              object and almost never edited, so they fold away below.
            -->
            <div>
              <div class="mb-1 flex items-baseline justify-between">
                <label class="label font-semibold" for="gist-content">{t("gist.content")}</label>
                <span class="text-xs {tooLarge ? 'text-error-500' : 'text-surface-500'}">
                  {kb(bytes)} / {kb(MAX_BYTES)}
                </span>
              </div>
              <textarea
                id="gist-content"
                class="input h-64 w-full resize-y rounded-sm font-mono text-sm"
                class:border-error-500={tooLarge}
                bind:value={content}
                placeholder={t("gist.contentPlaceholder")}
              ></textarea>
            </div>

            <details>
              <summary class="text-surface-600 cursor-pointer text-sm">{t("gist.details")}</summary>
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <label class="label mb-1 text-sm" for="gist-filename">{t("gist.filename")}</label>
                  <input
                    id="gist-filename"
                    class="input w-full rounded-sm"
                    bind:value={filename}
                    placeholder={t("gist.filenamePlaceholder")}
                  />
                </div>
                <div>
                  <label class="label mb-1 text-sm" for="gist-title">{t("gist.description")}</label>
                  <input
                    id="gist-title"
                    class="input w-full rounded-sm"
                    bind:value={title}
                    placeholder={t("gist.descriptionPlaceholder")}
                  />
                </div>
              </div>
            </details>

            <!--
              The warning was 12px grey filler under the textarea. It is the
              most consequential line in the dialog — who sees this, and for how
              long — so it gets the weight of a callout.
            -->
            <div class="bg-warning-500/10 flex gap-2 rounded-lg p-3">
              <span class="text-warning-600 shrink-0"><Icon type="lock" height="18" /></span>
              <p class="text-surface-700-300 text-xs">{t("gist.warn")}</p>
            </div>

            {#if errorMessage}
              <p role="alert" class="text-error-500 text-sm">{errorMessage}</p>
            {/if}
          </div>

          <footer class="flex justify-end gap-2 border-t border-surface-200-800 p-4">
            <button type="button" class="btn preset-outlined" onclick={() => (open = false)}>
              {t("gist.cancel")}
            </button>
            <button type="button" class="btn preset-filled" disabled={!canShare} onclick={submit}>
              {creating ? t("gist.creating") : t("gist.share")}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog>
{/if}
