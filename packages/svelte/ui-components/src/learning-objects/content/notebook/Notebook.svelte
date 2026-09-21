<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { prefersReducedMotion } from "@tutors/a11y";
  import type { LiveNotebook } from "@tutors/course/course";
  import { currentCodeTheme } from "@tutors/course/markdown";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  import { copyCode } from "@tutors/course/markdown";
  import NotebookCell from "./cells/NotebookCell.svelte";
  import "./notebook-styles.css";

  interface Props {
    notebook: LiveNotebook;
  }
  let { notebook }: Props = $props();

  let loaded = false;
  let activeIndex = $state(0);
  let revealedOutputs = $state<Record<number, boolean>>({});
  let revealedSolutions = $state<Record<number, boolean>>({});

  function toggleOutput(index: number) {
    revealedOutputs[index] = !revealedOutputs[index];
  }

  function toggleSolution(index: number) {
    revealedSolutions[index] = !revealedSolutions[index];
  }

  function scrollToCell(index: number) {
    const el = document.getElementById(`notebook-cell-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: prefersReducedMotion.value ? "auto" : "smooth", block: "start" });
    }
  }

  function handleCellClick(index: number) {
    activeIndex = index;
    notebook.setActiveCell(index);
    document.getElementById(`notebook-cell-${index}`)?.focus({ preventScroll: true });
    scrollToCell(index);
  }

  afterNavigate(() => {
    if (!loaded) {
      loaded = true;
      return;
    }
    const elemPage = document.querySelector("#notebook-panel");
    if (elemPage && window.innerWidth >= 600) {
      elemPage.scrollIntoView({ behavior: prefersReducedMotion.value ? "auto" : "smooth", block: "start" });
    }
  });
</script>

<svelte:head>
  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/katex@0.18.1/dist/katex.min.css"
  />
</svelte:head>

<div class="notebook-content w-full">
  <div class="grid min-w-0 gap-4">
    <details class="ui-panel notebook-outline">
      <summary class="cursor-pointer py-2 font-semibold">Notebook outline · {notebook.cells.length} cells</summary>
      <nav aria-label="Notebook cells">
        <ol class="grid gap-1">
          {#each notebook.cells as cell, i}
            <li><button class="notebook-step" aria-current={activeIndex === i ? 'step' : undefined} onclick={() => handleCellClick(i)}><span class="ui-muted">{i + 1}</span>{notebook.isSolutionCell(cell) ? 'Solution' : notebook.getCellLabel(cell, i)}<span class="ui-muted ml-auto text-xs">{cell.cellType}</span></button></li>
          {/each}
        </ol>
      </nav>
    </details>

    <!-- Main content area -->
    <div class="min-w-0 flex-1 reading-panel" use:copyCode>
      <div id="notebook-panel" class="mt-[-60px] block pt-[60px]">
        {#key currentCodeTheme.value}
          {#each notebook.cells as cell, i}
            <NotebookCell
              {cell}
              index={i}
              {notebook}
              isActive={activeIndex === i}
              outputRevealed={revealedOutputs[i] ?? false}
              solutionRevealed={revealedSolutions[i] ?? false}
              onToggleOutput={() => toggleOutput(i)}
              onToggleSolution={() => toggleSolution(i)}
              onClick={() => { activeIndex = i; notebook.setActiveCell(i); }}
              kernelLanguage={notebook.notebook.kernelLanguage}
            />
          {/each}
        {/key}
      </div>
    </div>
  </div>

  <nav aria-label="Notebook cell navigation" class="ui-actions mt-4 justify-between">
    <button class="ui-button" disabled={activeIndex <= 0} onclick={() => handleCellClick(activeIndex - 1)}>Previous cell</button>
    <span class="ui-muted text-sm">Cell {activeIndex + 1} of {notebook.cells.length}</span>
    <button class="ui-button" disabled={activeIndex >= notebook.cells.length - 1} onclick={() => handleCellClick(activeIndex + 1)}>Next cell</button>
  </nav>
</div>
<style>
  .notebook-content { max-width: calc(var(--reading-width, 720px) + 80px); margin-inline: auto; }
  .notebook-outline { padding: var(--space-3) var(--space-4); }
  .notebook-outline nav { max-height: 320px; overflow: auto; margin-top: var(--space-3); }
  .notebook-step { display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3); text-align: left; border-radius: var(--radius-control); font-size: var(--font-label); overflow-wrap: anywhere; }
  .notebook-step:hover, .notebook-step[aria-current] { background: var(--ui-selected); }
  .notebook-step[aria-current] { box-shadow: inset 3px 0 var(--ui-brand); }
</style>
