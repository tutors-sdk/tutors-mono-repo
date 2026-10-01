import { describe, expect, it, vi } from "vitest";
import type { Course, Notebook, NotebookCell } from "@tutors/tutors-model-lib";
import { LiveNotebook } from "../../../packages/svelte/course/src/course/services/live-notebook.ts";

vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => ({
  rune: <T>(value: T) => ({ value })
}));

const cell = (source: string, cellType: NotebookCell["cellType"] = "markdown", metadata: NotebookCell["metadata"] = {}): NotebookCell => ({
  source, cellType, metadata, outputs: [], executionCount: null, id: source
});
const open = (cells?: NotebookCell[]) => new LiveNotebook({} as Course, { cells } as Notebook, "/notebook/test");

describe("LiveNotebook", () => {
  it("finds real heading cells using the same Markdown syntax as the reader", () => {
    const notebook = open([
      cell("# **Introduction**"),
      cell("An introductory paragraph.\n\n## Exercise `one`"),
      cell("Setext heading\n--------------"),
      cell("### Third level ###"),
      cell("#### Ignored\n\n## <em>Included</em>"),
      cell("    # indented code comment"),
      cell("```python\n# fenced comment\n```"),
      cell("# Python comment", "code"),
      cell("# Raw text", "raw"),
      cell("#### Outside the outline depth")
    ]);
    expect(notebook.outline).toEqual([
      { index: 0, title: "Introduction" },
      { index: 1, title: "Exercise one" },
      { index: 2, title: "Setext heading" },
      { index: 3, title: "Third level" },
      { index: 4, title: "Included" }
    ]);
  });

  it("falls back to every cell when there are no real headings", () => {
    const notebook = open([cell("    # code"), cell("print(1)", "code"), cell("plain", "raw"), cell("")]);
    expect(notebook.outline).toEqual([
      { index: 0, title: "# code" }, { index: 1, title: "[ ]" },
      { index: 2, title: "Cell 3" }, { index: 3, title: "Cell 4" }
    ]);
    expect(open().outline).toEqual([]);
    expect(open().nextCell()).toBe(0);
    expect(open().prevCell()).toBe(0);
  });

  it("keeps selection in bounds and advances relative to the selected cell", () => {
    const notebook = open([cell("# Start"), cell("middle", "code"), cell("# End")]);
    expect(notebook.prevCell()).toBe(0);
    expect(notebook.nextCell()).toBe(1);
    notebook.setActiveCell(1);
    expect(notebook.activeCellIndex).toBe(1);
    expect(notebook.prevCell()).toBe(0);
    expect(notebook.nextCell()).toBe(2);
    notebook.setActiveCell(2);
    expect(notebook.nextCell()).toBe(2);
    for (const index of [-1, 3, NaN, 1.5, Infinity]) notebook.setActiveCell(index);
    expect(notebook.activeCellIndex).toBe(2);
  });

  it("labels cells and recognizes only array-based exercise and solution tags", () => {
    const notebook = open();
    expect(notebook.getCellLabel({ ...cell("", "code"), executionCount: 0 }, 0)).toBe("[0]");
    expect(notebook.getCellLabel(cell("# " + "a".repeat(31)), 0)).toBe("a".repeat(30) + "...");
    expect(notebook.getCellLabel(cell("# Short"), 0)).toBe("Short");
    expect(notebook.isSolutionCell(cell("", "code", { tags: ["solution"] }))).toBe(true);
    expect(notebook.isExerciseCell(cell("", "code", { tags: ["exercise"] }))).toBe(true);
    expect(notebook.isSolutionCell(cell("", "code", { tags: "solution" }))).toBe(false);
    expect(notebook.isExerciseCell(cell("", "code", { tags: [] }))).toBe(false);
    expect(["code", "markdown", "raw"].map(type => notebook.getCellTypeIcon(type))).toEqual(["terminal", "document", "text"]);
  });

  it("escapes navigation labels, hides solution source, and refreshes the pager after selection", () => {
    const notebook = open([
      cell('# <b>&"label"</b>'), cell("answer", "code", { tags: ["solution"] }),
      cell("exercise", "code", { tags: ["exercise"] }), cell("code", "code"), cell("raw", "raw")
    ]);
    expect(notebook.navbarHtml).toContain("&lt;b&gt;&amp;&quot;label&quot;&lt;/b&gt;");
    expect(notebook.navbarHtml).toContain("Solution");
    expect(notebook.navbarHtml).not.toContain("answer");
    expect(notebook.horizontalNavbarHtml).toContain("disabled");
    notebook.setActiveCell(2);
    expect(notebook.horizontalNavbarHtml).toContain("3 / 5");
    expect(notebook.horizontalNavbarHtml).not.toContain("disabled");
    notebook.setActiveCell(4);
    expect(notebook.horizontalNavbarHtml).toContain("disabled");
  });
});
