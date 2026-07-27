<script lang="ts">
  import type { NotebookCell as NotebookCellType } from "@tutors/tutors-model-lib";
  import type { LiveNotebook } from "@tutors/course/course";
  import NotebookSolutionCell from "./NotebookSolutionCell.svelte";
  import NotebookExerciseCell from "./NotebookExerciseCell.svelte";
  import NotebookCodeCell from "./NotebookCodeCell.svelte";
  import NotebookMarkdownCell from "./NotebookMarkdownCell.svelte";
  import NotebookRawCell from "./NotebookRawCell.svelte";

  interface Props {
    cell: NotebookCellType;
    index: number;
    notebook: LiveNotebook;
    isActive: boolean;
    outputRevealed: boolean;
    solutionRevealed: boolean;
    onToggleOutput: () => void;
    onToggleSolution: () => void;
    onClick: () => void;
    kernelLanguage?: string;
  }

  let {
    cell,
    index,
    notebook,
    isActive,
    outputRevealed,
    solutionRevealed,
    onToggleOutput,
    onToggleSolution,
    onClick,
    kernelLanguage = "python"
  }: Props = $props();
</script>

<div
  id="notebook-cell-{index}"
  class="notebook-cell mb-2 rounded-lg border transition-colors"
  style="border-color: {isActive
    ? 'light-dark(var(--color-primary-300), var(--color-primary-600))'
    : 'light-dark(var(--color-surface-200), var(--color-surface-700))'};"
  role="button"
  tabindex="-1"
  onclick={onClick}
  onkeydown={() => {}}
>
  {#if notebook.isSolutionCell(cell)}
    <NotebookSolutionCell
      {cell}
      {index}
      {solutionRevealed}
      outputRevealed={outputRevealed}
      onToggleSolution={onToggleSolution}
      onToggleOutput={onToggleOutput}
    />
  {:else if notebook.isExerciseCell(cell)}
    <NotebookExerciseCell {cell} {kernelLanguage} />
  {:else if cell.cellType === "code"}
    <NotebookCodeCell
      {cell}
      {index}
      revealed={outputRevealed}
      onToggleOutput={onToggleOutput}
    />
  {:else if cell.cellType === "markdown"}
    <NotebookMarkdownCell {cell} />
  {:else}
    <NotebookRawCell {cell} />
  {/if}
</div>
