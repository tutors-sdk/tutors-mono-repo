<script lang="ts">
  /**
   * The learner's private notes on a lab step (Rules 0380 to 0383, 0554 to 0558): docked beside the
   * step on a wide screen and a bottom sheet under 1024px, minimised to a bar or closed to the
   * Notes button, with the same state on every step. Notes stay in this browser; the exports are
   * built here and downloaded, never sent anywhere.
   */
  import { tick } from "svelte";
  import type { LiveLab } from "@tutors/course/course";
  import { currentLabStepIndex } from "@tutors/runes";
  import { notesService, NOTE_KINDS, NOTES_PANEL_MAX_WIDTH, NOTES_PANEL_MIN_WIDTH, stepRef, type StepRef } from "@tutors/course/notes";
  import { currentCodeTheme } from "@tutors/course/markdown";
  import { convertMdToHtml } from "@tutors/tutors-model-lib";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  import { toaster } from "@tutors/ui-primitives/utils/toaster";
  import { t, type MessageKey } from "@tutors/i18n";

  let { lab }: { lab: LiveLab } = $props();

  const panel = $derived(notesService.panel.value);
  const stepId = $derived(lab.steps[currentLabStepIndex.value] ?? "");
  const ref = $derived(stepRef(lab.course.courseId, lab.url, stepId));
  const titleOf = (id: string) => (lab.chaptersTitles.get(decodeURI(id)) ?? decodeURI(id)).trim();
  const stepTitle = $derived(titleOf(stepId));
  const otherNoted = $derived(notesService.noted.value.filter((id) => id !== stepId && lab.steps.includes(id)));

  let preview = $state(false);
  let confirmingDelete = $state(false);

  $effect(() => {
    notesService.restorePanel();
  });

  $effect(() => {
    if (ref) void notesService.arrive(ref, { labTitle: lab.lab.title, stepTitle });
  });

  $effect(() => {
    if (notesService.sessionOnly.value && notesService.takeSessionOnlyWarning()) {
      toaster.create({ type: "warning", title: t("notes.sessionOnlyTitle"), description: t("notes.sessionOnly") });
    }
  });

  // A note still settling when the learner closes or reloads the page is written as the page goes.
  $effect(() => {
    const keep = () => void notesService.flush();
    const hidden = () => document.visibilityState === "hidden" && keep();
    addEventListener("pagehide", keep);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      keep();
      removeEventListener("pagehide", keep);
      document.removeEventListener("visibilitychange", hidden);
    };
  });

  const kindLabel = (kind: string) => t(`notes.kind.${kind}` as MessageKey);

  const readerUrl = (r: StepRef) => `${location.origin}${r.labRoute}/${r.stepId}`;
  const target = () => ({ courseId: lab.course.courseId, title: lab.course.title, readerUrl });
  const fileName = (name: string) => `${name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "course"}-notes.md`;

  function download(markdown: string, name: string) {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function exportCourse() {
    download(await notesService.exportCourse(target()), fileName(lab.course.courseId));
  }

  async function exportLab() {
    const route = lab.url.split("/").filter(Boolean).pop() ?? "lab";
    download(await notesService.exportLab(target(), lab.url), fileName(`${lab.course.courseId}-${route}`));
  }

  async function deleteAll() {
    await notesService.deleteCourse(lab.course.courseId);
    confirmingDelete = false;
  }

  async function openPanel() {
    notesService.open();
    await tick();
    document.getElementById("notes-body")?.focus();
  }

  /** The divider on the panel's leading edge: drag it, or use the arrow keys, to change the width. */
  function resizeKey(event: KeyboardEvent) {
    const delta = event.key === "ArrowLeft" ? 16 : event.key === "ArrowRight" ? -16 : 0;
    if (!delta) return;
    event.preventDefault();
    notesService.setWidth(panel.width + delta);
  }

  function resizeStart(event: PointerEvent) {
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = panel.width;
    const move = (e: PointerEvent) => notesService.setWidth(startWidth + (startX - e.clientX));
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  }
</script>

{#if ref}
  {#if panel.open && panel.minimised}
    <div class="notes-minimised ui-panel" role="region" aria-label={t("notes.title")}>
      <span class="ui-eyebrow">{t("notes.title")}</span>
      <span class="minimised-step">{stepTitle}</span>
      <button type="button" class="ui-button" onclick={openPanel}>{t("notes.restore")}</button>
    </div>
  {:else if panel.open}
    <aside id="notes-panel" class="notes-panel ui-panel" aria-label={t("notes.title")} style:--notes-width={`${panel.width}px`}>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div class="resize-handle" role="separator" aria-orientation="vertical" aria-label={t("notes.resize")} aria-valuemin={NOTES_PANEL_MIN_WIDTH} aria-valuemax={NOTES_PANEL_MAX_WIDTH} aria-valuenow={panel.width} tabindex="0" onkeydown={resizeKey} onpointerdown={resizeStart}></div>
      <header class="notes-header">
        <div>
          <span class="ui-eyebrow">{t("notes.title")}</span>
          <h2 class="notes-step">{stepTitle}</h2>
        </div>
        <div class="notes-actions">
          <button type="button" class="ui-button" onclick={() => notesService.minimise()}>{t("notes.minimise")}</button>
          <button type="button" class="ui-button" onclick={() => notesService.close()}>{t("notes.close")}</button>
        </div>
      </header>

      {#if notesService.sessionOnly.value}
        <p class="session-only" role="status">{t("notes.sessionOnly")}</p>
      {/if}

      <div class="notes-controls">
        <label class="kind">
          <span class="ui-label">{t("notes.kind")}</span>
          <select class="select" value={notesService.kind.value} onchange={(e) => notesService.setKind(e.currentTarget.value)}>
            {#each NOTE_KINDS as kind (kind)}<option value={kind}>{kindLabel(kind)}</option>{/each}
          </select>
        </label>
        <div class="view-switch" role="group" aria-label={t("notes.view")}>
          <button type="button" class="ui-button" aria-pressed={!preview} onclick={() => (preview = false)}>{t("notes.write")}</button>
          <button type="button" class="ui-button" aria-pressed={preview} onclick={() => (preview = true)}>{t("notes.preview")}</button>
        </div>
      </div>

      {#if preview}
        <div class="notes-preview prose dark:prose-invert">
          {#if notesService.body.value.trim()}{@html sanitizeHtml(convertMdToHtml(notesService.body.value, currentCodeTheme.value))}{:else}<p class="ui-muted">{t("notes.empty")}</p>{/if}
        </div>
      {:else}
        <label class="sr-only" for="notes-body">{t("notes.label")}</label>
        <textarea id="notes-body" class="notes-body" placeholder={t("notes.placeholder")} value={notesService.body.value} oninput={(e) => notesService.edit(e.currentTarget.value)} onblur={() => notesService.flush()}></textarea>
      {/if}
      <p class="save-state ui-muted" aria-live="polite">{notesService.saveState.value === "saved" ? t("notes.saved") : notesService.saveState.value === "pending" ? t("notes.saving") : t("notes.private")}</p>

      {#if otherNoted.length}
        <nav class="noted-steps" aria-label={t("notes.otherSteps")}>
          <h3 class="ui-label">{t("notes.otherSteps")}</h3>
          <ul>{#each otherNoted as id (id)}<li><a href={`${lab.url}/${id}`}>{titleOf(id)}</a></li>{/each}</ul>
        </nav>
      {/if}

      <footer class="notes-footer">
        <div class="ui-actions">
          <button type="button" class="ui-button ui-button-primary" onclick={exportCourse}>{t("notes.exportCourse")}</button>
          <button type="button" class="ui-button" onclick={exportLab}>{t("notes.exportLab")}</button>
        </div>
        {#if confirmingDelete}
          <div class="confirm" role="group" aria-label={t("notes.deleteAllConfirm")}>
            <p>{t("notes.deleteAllConfirm")}</p>
            <div class="ui-actions">
              <button type="button" class="ui-button danger" onclick={deleteAll}>{t("notes.deleteAllYes")}</button>
              <button type="button" class="ui-button" onclick={() => (confirmingDelete = false)}>{t("notes.cancel")}</button>
            </div>
          </div>
        {:else}
          <button type="button" class="link-button" onclick={() => (confirmingDelete = true)}>{t("notes.deleteAll")}</button>
        {/if}
      </footer>
    </aside>
  {/if}
{/if}

<style>
  .notes-panel { position: sticky; top: var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); width: var(--notes-width, 360px); max-width: 50%; max-height: calc(100dvh - var(--space-8)); overflow-y: auto; padding: var(--space-5); }
  .resize-handle { position: absolute; inset-block: var(--space-4); inset-inline-start: -6px; width: 12px; cursor: col-resize; border-radius: var(--radius-control); touch-action: none; }
  .resize-handle:hover, .resize-handle:focus-visible { background: color-mix(in srgb, var(--ui-brand) 24%, transparent); }
  .notes-header { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); }
  .notes-step { font-size: var(--font-section); font-weight: var(--weight-semibold); line-height: var(--leading-heading); overflow-wrap: anywhere; }
  .notes-actions { display: flex; gap: var(--space-2); flex-shrink: 0; }
  .notes-actions .ui-button, .view-switch .ui-button { min-height: 36px; padding: var(--space-1) var(--space-3); font-size: var(--font-meta); }
  .notes-controls { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-3); }
  .kind .ui-label { margin-bottom: var(--space-1); font-size: var(--font-meta); }
  .view-switch { display: flex; gap: 2px; padding: 2px; border-radius: var(--radius-control); background: var(--ui-canvas); border: 1px solid var(--ui-border); }
  .view-switch .ui-button { background: transparent; border-color: transparent; color: var(--ui-muted); }
  .view-switch .ui-button[aria-pressed="true"] { color: var(--ui-brand); background: var(--ui-surface); border-color: var(--ui-border); box-shadow: none; }
  .notes-body { width: 100%; min-height: 14rem; resize: vertical; padding: var(--space-3); font-family: var(--ui-mono-family, ui-monospace, monospace); font-size: var(--font-body); line-height: 1.5; }
  .notes-preview { min-height: 14rem; padding: var(--space-3); border: 1px solid var(--ui-border); border-radius: var(--radius-control); font-size: var(--font-body); }
  .save-state { margin-top: calc(-1 * var(--space-2)); font-size: var(--font-caption); }
  .session-only { padding: var(--space-3); border-radius: var(--radius-control); background: var(--ui-selected); color: var(--ui-warning); font-size: var(--font-meta); }
  .noted-steps ul { display: grid; gap: var(--space-1); }
  .noted-steps a { font-size: var(--font-meta); }
  .notes-footer { display: grid; gap: var(--space-3); padding-top: var(--space-4); border-top: 1px solid var(--ui-border); }
  .link-button { justify-self: start; min-height: 44px; color: var(--ui-error); font-size: var(--font-meta); text-decoration: underline; text-underline-offset: 3px; }
  .confirm p { margin-bottom: var(--space-2); font-size: var(--font-meta); }
  .danger { color: var(--ui-error); border-color: var(--ui-error); }
  .notes-minimised { position: fixed; right: var(--space-6); bottom: calc(var(--space-6) + 64px); z-index: 41; display: flex; align-items: center; gap: var(--space-3); max-width: min(28rem, calc(100vw - 2 * var(--space-4))); padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4); box-shadow: 0 4px 12px rgb(0 0 0 / 0.15); }
  .minimised-step { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-meta); }
  /* Under 1024px there is no room beside the step: the panel is a sheet across the bottom. */
  @media (max-width: 1023px) {
    .notes-panel { position: fixed; inset: auto 0 0 0; z-index: 45; width: auto; max-width: none; max-height: 70dvh; border-radius: var(--radius-panel) var(--radius-panel) 0 0; box-shadow: 0 -4px 16px rgb(0 0 0 / 0.18); }
    .resize-handle { display: none; }
    .notes-minimised { right: var(--space-4); left: var(--space-4); bottom: calc(var(--space-4) + 64px); max-width: none; }
  }
</style>
