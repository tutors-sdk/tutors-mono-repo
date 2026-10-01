<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { prefersReducedMotion } from "@tutors/a11y";
  import { currentNotebookCellIndex } from "@tutors/runes";
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

  /** How far below the top of the view a cell still counts as the one being read, in pixels. */
  const HEADING_REACHED_TOP = 120;

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

  /**
   * The course navigation marks the outline entry for the cell being read. It is a sibling of this page
   * rather than a parent, so the cell reaches it through a rune.
   *
   * The cell being read is the last outlined one whose top has reached the top of the reading area. Each
   * cell is looked up and measured afresh on every pass: the reading column remounts its cells under
   * {#key}, so an element held from an earlier pass can be one that has since left the page.
   *
   * The listener captures, because it is the reading column that scrolls here, not the window.
   */
  $effect(() => {
    const outlined = notebook.outline.map(entry => entry.index);
    let pending = 0;
    const update = () => {
      let current = outlined[0] ?? 0;
      for (const index of outlined) {
        const cell = document.getElementById(`notebook-cell-${index}`);
        if (cell && cell.getBoundingClientRect().top <= HEADING_REACHED_TOP) current = index;
      }
      currentNotebookCellIndex.value = current;
    };
    // One measurement per frame: a scroll fires far more often than the page paints.
    const schedule = () => {
      if (pending) return;
      pending = requestAnimationFrame(() => { pending = 0; update(); });
    };
    update();
    addEventListener("scroll", schedule, { capture: true, passive: true });
    addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(pending);
      removeEventListener("scroll", schedule, { capture: true });
      removeEventListener("resize", schedule);
    };
  });

  // Selecting a cell from the outline or the pager marks it straight away, rather than waiting for the
  // scroll it starts to settle.
  $effect(() => {
    currentNotebookCellIndex.value = notebook.outline.findLast(entry => entry.index <= activeIndex)?.index ?? activeIndex;
  });

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
    <!-- The outline is in the course navigation (CourseNavigation.svelte), beside a lab's steps. -->
    <!-- Main content area -->
    <div class="min-w-0 flex-1 reading-panel" use:copyCode>
      <div id="notebook-panel" class="notebook-cells mt-[-60px] block pt-[60px]">
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
    <span class="ui-muted cell-count">Cell {activeIndex + 1} of {notebook.cells.length}</span>
    <button class="ui-button" disabled={activeIndex >= notebook.cells.length - 1} onclick={() => handleCellClick(activeIndex + 1)}>Next cell</button>
  </nav>
</div>
<style>
  .notebook-cells { max-width: min(88ch, calc(var(--reading-width) + 16ch)); margin-inline: auto; }
  .cell-count { font-size: var(--font-label); }
</style>
