<script lang="ts">
  import type { NotebookCell } from "@tutors/tutors-model-lib";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";

  interface Props {
    cell: NotebookCell;
    index: number;
    solutionRevealed: boolean;
    outputRevealed: boolean;
    onToggleSolution: () => void;
    onToggleOutput: () => void;
  }
  let { cell, index, solutionRevealed, outputRevealed, onToggleSolution, onToggleOutput }: Props = $props();
</script>

<div class="solution-cell">
  <button
    class="ui-button w-full justify-start"
    aria-expanded={solutionRevealed}
    onclick={(e) => { e.stopPropagation(); onToggleSolution(); }}
  >
    <span class="text-base">{solutionRevealed ? "▾" : "▸"}</span>
    <span>{solutionRevealed ? "Hide Solution" : "Show Solution"}</span>
  </button>
  {#if solutionRevealed}
    <div class="flex">
      <div class="flex-shrink-0 w-14 pt-3 text-right pr-2 font-mono text-xs text-surface-400 select-none">
        [{cell.executionCount ?? " "}]:
      </div>
      <div class="flex-1 min-w-0 overflow-x-auto">
        <div class="notebook-code-source prose dark:prose-invert prose-pre:overflow-x-auto max-w-none">
          {@html sanitizeHtml(cell.sourceHtml ?? "")}
        </div>
        {#if cell.outputsHtml}
          <div class="flex items-center border-t border-surface-200 dark:border-surface-700 px-3 py-1.5">
            <button
              class="run-button ui-button"
              aria-expanded={outputRevealed}
              onclick={(e) => { e.stopPropagation(); onToggleOutput(); }}
            >
              <span class="text-sm">{outputRevealed ? "▾" : "▸"}</span>
              {outputRevealed ? "Hide Output" : "Show saved output"}
            </button>
          </div>
          {#if outputRevealed}
            <div class="notebook-outputs border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-3">
              {@html sanitizeHtml(cell.outputsHtml ?? "")}
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>
