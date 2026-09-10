<script lang="ts">
  /**
   * An editable, runnable notebook cell.
   *
   * It runs on the notebook's kernel rather than one of its own, so a cell can use what an
   * earlier cell defined. The engine is loaded on first run — opening a notebook downloads
   * nothing — and the code executes in a sandboxed frame, which is what allows this to work
   * under the reader's content security policy at all.
   */
  import { onMount } from "svelte";
  import { t } from "@tutors/i18n";
  import type { RuntimeEvent } from "@tutors/runtime";
  import CodeEditor from "../code/CodeEditor.svelte";
  import { getNotebookKernel } from "./notebook-kernel.svelte.ts";
  import "./notebook-styles.css";

  interface Props {
    source: string;
    language?: string;
  }
  let { source, language = "python" }: Props = $props();

  const notebookKernel = getNotebookKernel();

  let code = $state(source);
  let output = $state("");
  let hasRun = $state(false);
  let isRunning = $state(false);
  let executionCount = $state<number | null>(null);
  let failed = $state(false);

  const editorLanguage = $derived(language === "javascript" || language === "typescript" ? language : "python");
  const runnable = $derived(notebookKernel?.runtime !== null && notebookKernel?.runtime !== undefined);

  function handleEvent(event: RuntimeEvent, id: string) {
    if (event.type !== "stream" && event.type !== "result" && event.type !== "error") return;
    if (event.id !== id) return;
    if (event.type === "stream") output += event.text;
    if (event.type === "result" && event.value) output += `${event.value}\n`;
    if (event.type === "error" && event.message) output += `${event.message}\n`;
  }

  async function runCode() {
    const kernel = notebookKernel?.handle();
    if (!kernel || isRunning) return;

    isRunning = true;
    hasRun = true;
    failed = false;
    output = "";
    executionCount = notebookKernel?.nextExecutionCount() ?? null;

    const id = `cell-${executionCount}-${Math.random().toString(36).slice(2, 8)}`;
    // Every cell hears everything the kernel says, so this one listens for its own run and
    // stops listening the moment that run is over.
    const unsubscribe = kernel.subscribe((event) => handleEvent(event, id));
    try {
      const result = await kernel.execute({ id, runtime: notebookKernel!.runtime!, mode: "cell", files: [{ path: "cell", content: code }], entry: "cell" });
      failed = !result.ok;
    } finally {
      unsubscribe();
      isRunning = false;
    }
  }

  function resetCode() {
    code = source;
    output = "";
    hasRun = false;
    failed = false;
    executionCount = null;
  }

  // Registering returns the way to unregister, which is what onMount does with a callback.
  onMount(() => notebookKernel?.register(runCode));
</script>

<div class="notebook-editor">
  <CodeEditor value={code} language={editorLanguage} onChange={(value) => (code = value)} onRun={runCode} />
</div>

<div class="border-surface-200 dark:border-surface-700 flex items-center gap-2 border-t px-3 py-1.5">
  {#if runnable}
    <button
      class="run-button bg-success-100 dark:bg-success-900 text-success-700 dark:text-success-300 hover:bg-success-200 dark:hover:bg-success-800 flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      onclick={runCode}
      disabled={isRunning}
    >
      {#if isRunning}
        <span class="animate-spin text-sm">&#9696;</span>
        {notebookKernel?.detail || t("playground.running")}
      {:else}
        <span class="text-sm">&#9654;</span>
        {t("playground.run")}
      {/if}
    </button>

    {#if hasRun}
      <button class="bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700 flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors" onclick={resetCode}>
        {t("playground.reset")}
      </button>
      <span class="text-surface-400 font-mono text-xs">[{executionCount ?? " "}]</span>
    {/if}
  {:else}
    <span class="text-surface-400 text-xs">{t("notebook.notRunnable")}</span>
  {/if}
</div>

{#if hasRun && output}
  <div class="notebook-outputs border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 border-t p-3">
    <pre class="font-mono text-sm whitespace-pre-wrap {failed ? 'text-error-600 dark:text-error-400' : ''}" aria-live="polite">{output}</pre>
  </div>
{/if}
