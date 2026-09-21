<script lang="ts">
  import type { NotebookCell } from "@tutors/tutors-model-lib";
  import NotebookCodeEditor from "../NotebookCodeEditor.svelte";

  interface Props {
    cell: NotebookCell;
    kernelLanguage?: string;
  }
  let { cell, kernelLanguage = "python" }: Props = $props();
</script>

<div class="exercise-cell">
  <div class="flex items-center gap-2 px-4 py-1.5 border-b" style="background-color: var(--ui-selected); border-color: var(--ui-border);">
    <span class="text-xs font-semibold uppercase tracking-wide" style="color: var(--ui-brand);">Exercise</span>
  </div>
  <div class="flex">
    <div class="flex-shrink-0 w-14 pt-3 text-right pr-2 font-mono text-xs text-surface-400 select-none">
      [{cell.executionCount ?? " "}]:
    </div>
    <div class="flex-1 min-w-0 overflow-x-auto">
      <NotebookCodeEditor source={cell.source} language={kernelLanguage} />
    </div>
  </div>
</div>
