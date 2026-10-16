<script lang="ts">
  /** Opens and closes the notes panel from the step's tools; a dot says this step has a note (Rule 0555). */
  import { tick } from "svelte";
  import { notesService } from "@tutors/course/notes";
  import { t } from "@tutors/i18n";

  let { stepId }: { stepId: string } = $props();

  const panel = $derived(notesService.panel.value);
  const expanded = $derived(panel.open && !panel.minimised);
  const hasNote = $derived(notesService.noted.value.includes(stepId));

  async function toggle() {
    if (expanded) {
      notesService.close();
      return;
    }
    notesService.open();
    await tick();
    document.getElementById("notes-body")?.focus();
  }
</script>

<button type="button" class="ui-button notes-toggle" aria-expanded={expanded} aria-controls="notes-panel" onclick={toggle}>
  {t("notes.button")}{#if hasNote}<span class="note-dot" role="img" aria-label={t("notes.hasNote")}></span>{/if}
</button>

<style>
  .notes-toggle { min-height: 30px; padding: var(--space-1) var(--space-3); gap: var(--space-2); font-size: var(--font-meta); }
  .notes-toggle[aria-expanded="true"] { color: var(--ui-brand); border-color: var(--ui-brand); }
  .note-dot { display: inline-block; width: 8px; height: 8px; border-radius: 999px; background: var(--ui-brand); }
</style>
