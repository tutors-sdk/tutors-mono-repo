<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount, onDestroy } from "svelte";
  import { currentCodeTheme } from "@tutors/course/markdown";
  import "./notebook-styles.css";

  interface Props {
    source: string;
    language?: string;
  }
  let { source, language = "python" }: Props = $props();

  let editorContainer: HTMLDivElement;
  let editorView: any = null;
  let output = $state("");
  let isRunning = $state(false);
  let hasRun = $state(false);
  let pyodideLoading = $state(false);
  let pyodideInstance: any = null;

  function getEditorContent(): string {
    if (!editorView) return source;
    return editorView.state.doc.toString();
  }

  async function loadPyodide() {
    if (pyodideInstance) return pyodideInstance;
    if ((window as any).__pyodideInstance) {
      pyodideInstance = (window as any).__pyodideInstance;
      return pyodideInstance;
    }

    pyodideLoading = true;
    try {
      if (!(window as any).loadPyodide) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/pyodide/v0.27.4/full/pyodide.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Pyodide"));
          document.head.appendChild(script);
        });
      }
      pyodideInstance = await (window as any).loadPyodide();
      (window as any).__pyodideInstance = pyodideInstance;
      return pyodideInstance;
    } finally {
      pyodideLoading = false;
    }
  }

  async function runCode() {
    isRunning = true;
    output = "";
    hasRun = true;

    try {
      const pyodide = await loadPyodide();
      const code = getEditorContent();

      pyodide.setStdout({ batched: (text: string) => { output += text + "\n"; } });
      pyodide.setStderr({ batched: (text: string) => { output += text + "\n"; } });

      const result = await pyodide.runPythonAsync(code);
      if (result !== undefined && result !== null) {
        const repr = result.toString();
        if (repr && !output.endsWith(repr + "\n")) {
          output += repr + "\n";
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const cleaned = msg.replace(/PythonError: Traceback \(most recent call last\):\n\s+File "<exec>", line \d+, in <module>\n/, "");
      output += cleaned;
    } finally {
      isRunning = false;
    }
  }

  function resetCode() {
    if (!editorView) return;
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: source }
    });
    output = "";
    hasRun = false;
  }

  onMount(async () => {
    if (!browser) return;

    const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } = await import("@codemirror/view");
    const { EditorState } = await import("@codemirror/state");
    const { python } = await import("@codemirror/lang-python");
    const { oneDark } = await import("@codemirror/theme-one-dark");
    const { defaultKeymap, history, historyKeymap } = await import("@codemirror/commands");
    const { syntaxHighlighting, defaultHighlightStyle, bracketMatching } = await import("@codemirror/language");
    const { closeBrackets, closeBracketsKeymap } = await import("@codemirror/autocomplete");

    const isDark = currentCodeTheme.value?.includes("dark") ||
                   currentCodeTheme.value?.includes("night") ||
                   currentCodeTheme.value?.includes("dracula") ||
                   document.documentElement.classList.contains("dark");

    const extensions = [
      EditorView.contentAttributes.of({ "aria-label": `${language} exercise code` }),
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      bracketMatching(),
      closeBrackets(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap]),
      python(),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": { fontSize: "0.875rem" },
        ".cm-content": { fontFamily: "monospace", padding: "0.75rem 0" },
        ".cm-gutters": { minWidth: "3rem" },
        ".cm-scroller": { overflow: "auto" }
      })
    ];

    if (isDark) {
      extensions.push(oneDark);
    } else {
      extensions.push(syntaxHighlighting(defaultHighlightStyle, { fallback: true }));
    }

    editorView = new EditorView({
      state: EditorState.create({
        doc: source,
        extensions
      }),
      parent: editorContainer
    });
  });

  onDestroy(() => {
    editorView?.destroy();
  });
</script>

<div class="notebook-editor" bind:this={editorContainer}></div>

<div class="ui-actions exercise-actions" aria-busy={isRunning}>
  <button
    class="ui-button ui-button-primary"
    onclick={runCode}
    disabled={isRunning}
  >
    {#if isRunning}
      <span class="text-sm animate-spin">&#9696;</span>
      {pyodideLoading ? "Loading Python..." : "Running..."}
    {:else}
      <span aria-hidden="true">&#9654;</span>
      Run
    {/if}
  </button>

  {#if hasRun}
    <button
      class="ui-button"
      disabled={isRunning}
      onclick={resetCode}
    >
      Reset
    </button>
  {/if}
</div>

{#if hasRun && output}
  <div class="notebook-outputs exercise-output" role="status" aria-label="Python output">
    <pre class="text-sm font-mono whitespace-pre-wrap">{output}</pre>
  </div>
{/if}

<style>
  .exercise-actions, .exercise-output { padding: var(--space-3); border-top: 1px solid var(--ui-border); background: var(--ui-surface); }
</style>
