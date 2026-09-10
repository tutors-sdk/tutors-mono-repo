<script lang="ts">
  /**
   * One CodeMirror editor, used by both playgrounds and notebook cells.
   *
   * Everything it needs is loaded on mount rather than imported at the top: an editor is
   * only ever needed on a page that has code on it, and the reader is mostly pages that
   * do not.
   */
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";
  import { currentCodeTheme } from "@tutors/course/markdown";

  interface Props {
    value: string;
    language?: "python" | "javascript" | "typescript" | "json" | "text";
    readOnly?: boolean;
    /** Fired on every keystroke; the caller owns the text from here on. */
    onChange?: (value: string) => void;
    /** Ctrl/Cmd+Enter, the shortcut every notebook has trained people to expect. */
    onRun?: () => void;
    minHeight?: string;
  }
  let { value, language = "python", readOnly = false, onChange, onRun, minHeight = "auto" }: Props = $props();

  let container: HTMLDivElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let view: any = null;
  let applying = false;

  function isDarkTheme(): boolean {
    const theme = currentCodeTheme.value ?? "";
    return theme.includes("dark") || theme.includes("night") || theme.includes("dracula") || document.documentElement.classList.contains("dark");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function languageExtension(): Promise<any[]> {
    try {
      if (language === "python") {
        const { python } = await import("@codemirror/lang-python");
        return [python()];
      }
      if (language === "javascript" || language === "typescript" || language === "json") {
        const { javascript } = await import("@codemirror/lang-javascript");
        return [javascript({ typescript: language === "typescript" })];
      }
    } catch {
      // Highlighting is a nicety. A missing grammar leaves a plain editor, not a broken page.
    }
    return [];
  }

  onMount(async () => {
    if (!browser) return;

    const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } = await import("@codemirror/view");
    const { EditorState, Compartment } = await import("@codemirror/state");
    const { oneDark } = await import("@codemirror/theme-one-dark");
    const { defaultKeymap, history, historyKeymap, indentWithTab } = await import("@codemirror/commands");
    const { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentUnit } = await import("@codemirror/language");
    const { closeBrackets, closeBracketsKeymap } = await import("@codemirror/autocomplete");

    const editable = new Compartment();

    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      bracketMatching(),
      closeBrackets(),
      indentUnit.of("    "),
      keymap.of([
        {
          key: "Mod-Enter",
          preventDefault: true,
          run: () => {
            onRun?.();
            return true;
          }
        },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab
      ]),
      ...(await languageExtension()),
      EditorView.lineWrapping,
      editable.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
      EditorView.updateListener.of((update: { docChanged: boolean; state: { doc: { toString: () => string } } }) => {
        if (!update.docChanged || applying) return;
        onChange?.(update.state.doc.toString());
      }),
      EditorView.theme({
        "&": { fontSize: "0.875rem", minHeight },
        ".cm-content": { fontFamily: "monospace", padding: "0.75rem 0" },
        ".cm-gutters": { minWidth: "3rem" },
        ".cm-scroller": { overflow: "auto" }
      })
    ];

    extensions.push(isDarkTheme() ? oneDark : syntaxHighlighting(defaultHighlightStyle, { fallback: true }));

    view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: container
    });
  });

  // The caller can replace the text — switching file, resetting the exercise, loading a
  // student's saved work — and the editor has to follow without echoing that back as an
  // edit of the student's own.
  $effect(() => {
    const next = value;
    if (!view || next === view.state.doc.toString()) return;
    applying = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    applying = false;
  });

  onDestroy(() => view?.destroy());
</script>

<div bind:this={container} class="tutors-code-editor"></div>

<style>
  .tutors-code-editor :global(.cm-editor) {
    border-radius: 0.375rem;
  }
  .tutors-code-editor :global(.cm-editor.cm-focused) {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 1px;
  }
</style>
