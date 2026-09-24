<script lang="ts">
  import type { NotebookCell } from "@tutors/tutors-model-lib";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";

  import { t } from "@tutors/i18n";
  interface Props {
    cell: NotebookCell;
    index: number;
    revealed: boolean;
    onToggleOutput: () => void;
  }
  let { cell, index, revealed, onToggleOutput }: Props = $props();
</script>

<div class="flex">
  <div class="flex-shrink-0 w-14 pt-3 text-right pr-2 font-mono text-xs ui-muted select-none">
    [{cell.executionCount ?? " "}]:
  </div>
  <div class="flex-1 min-w-0 overflow-x-auto">
    <div class="notebook-code-source prose dark:prose-invert prose-pre:overflow-x-auto max-w-none">
      {@html sanitizeHtml(cell.sourceHtml ?? "")}
    </div>
    {#if cell.outputsHtml}
      <div class="flex items-center border-t border-[var(--ui-border)] px-3 py-1.5">
        <button
          aria-expanded={revealed}
          class="run-button ui-button"
          onclick={(e) => { e.stopPropagation(); onToggleOutput(); }}
        >
          <span class="text-sm" aria-hidden="true">{revealed ? "▾" : "▸"}</span>
          {revealed ? t("shell.hideOutput") : t("shell.showOutput")}
        </button>
      </div>
      {#if revealed}
        <div class="notebook-outputs border-t border-[var(--ui-border)] bg-[var(--ui-raised)] p-3">
          {@html sanitizeHtml(cell.outputsHtml ?? "")}
        </div>
      {/if}
    {/if}
  </div>
</div>
