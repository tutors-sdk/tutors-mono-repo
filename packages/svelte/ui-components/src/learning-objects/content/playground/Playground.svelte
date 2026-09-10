<script lang="ts">
  /**
   * A playground: an editable workspace with a Run button, running in the browser.
   *
   * Nothing here needs an account. The code executes in a sandboxed frame on the student's
   * own machine, the work is kept in their own browser, and a link can carry a whole
   * workspace to someone else without either of them signing in. Signing in adds one thing
   * — the ability to hand a snapshot to a lecturer — and takes nothing away.
   */
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";
  import Iconify from "@iconify/svelte";
  import { t } from "@tutors/i18n";
  import type { Playground } from "@tutors/tutors-model-lib";
  import {
    Kernel,
    decodeShareLink,
    encodeShareLink,
    indexedDbStore,
    isReadOnly,
    languageForPath,
    memoryStore,
    mergeWorkspace,
    runtimeFileExtension,
    runtimeLabel,
    type ExecutionPhase,
    type RuntimeEvent,
    type RuntimeFile,
    type WorkspaceStore
  } from "@tutors/runtime";
  import CodeEditor from "../code/CodeEditor.svelte";
  import PlaygroundSnapshot from "./PlaygroundSnapshot.svelte";

  interface Props {
    lo: Playground;
  }
  let { lo }: Props = $props();

  const courseId = $derived(lo.parentCourse?.courseId ?? "unknown");
  const loId = $derived(lo.route);
  const authored = $derived(lo.files ?? []);

  let files = $state<RuntimeFile[]>([]);
  let activePath = $state("");
  let output = $state("");
  let hasRun = $state(false);
  let running = $state(false);
  let phase = $state<ExecutionPhase>("idle");
  let statusDetail = $state("");
  let lastOk = $state<boolean | null>(null);
  let saveNotice = $state("");
  let shareNotice = $state("");
  let shared = $state(false);
  let newFileName = $state("");
  let addingFile = $state(false);

  let kernel: Kernel | undefined;
  let store: WorkspaceStore = memoryStore();
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const activeFile = $derived(files.find((file) => file.path === activePath));
  const activeReadOnly = $derived(shared ? false : isReadOnly(lo, activePath));
  const authoredPaths = $derived(new Set(authored.map((file) => file.path)));

  function handleEvent(event: RuntimeEvent) {
    if (event.type === "status") {
      phase = event.phase;
      statusDetail = event.detail ?? "";
    }
    if (event.type === "stream") output += event.text;
    if (event.type === "result" && event.value) output += `${event.value}\n`;
    if (event.type === "error" && event.message) output += `${event.message}\n`;
  }

  async function run(mode: "script" | "test") {
    if (!kernel || running) return;
    running = true;
    hasRun = true;
    lastOk = null;
    output = "";

    // The test file is appended rather than merged in: it is the lecturer's, it is not in
    // the student's workspace, and the engines take the last file as the one to check.
    const payload = mode === "test" && lo.tests ? [...files, { path: lo.tests.path, content: lo.tests.content }] : files;
    const result = await kernel.execute({ runtime: lo.runtime, mode, files: payload, entry: lo.entry, packages: lo.packages });

    running = false;
    lastOk = result.ok;
  }

  function stop() {
    kernel?.stop();
    running = false;
  }

  function scheduleSave() {
    if (shared) return;
    saveNotice = t("playground.saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await store.save({ courseId, loId, files: $state.snapshot(files) as RuntimeFile[], entry: lo.entry, updatedAt: new Date().toISOString() });
      saveNotice = t("playground.saved");
    }, 800);
  }

  function edit(path: string, content: string) {
    const file = files.find((candidate) => candidate.path === path);
    if (!file || file.content === content) return;
    file.content = content;
    scheduleSave();
  }

  async function reset() {
    if (!confirm(t("playground.resetConfirm"))) return;
    files = authored.map((file) => ({ path: file.path, content: file.content }));
    activePath = files[0]?.path ?? "";
    output = "";
    hasRun = false;
    lastOk = null;
    await store.remove(courseId, loId);
    saveNotice = "";
  }

  async function share() {
    const encoded = await encodeShareLink($state.snapshot(files) as RuntimeFile[], lo.entry);
    // The fragment, so the code never leaves the browser on its way to being shared.
    const url = `${location.origin}${location.pathname}#w=${encoded}`;
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      shareNotice = t("playground.shareCopied");
    } catch {
      shareNotice = t("playground.shareReady");
    }
    setTimeout(() => (shareNotice = ""), 4000);
  }

  function addFile() {
    const trimmed = newFileName.trim();
    addingFile = false;
    newFileName = "";
    if (!trimmed || files.some((file) => file.path === trimmed)) return;
    const path = trimmed.includes(".") ? trimmed : `${trimmed}.${runtimeFileExtension(lo.runtime)}`;
    files.push({ path, content: "" });
    activePath = path;
    scheduleSave();
  }

  function deleteFile(path: string) {
    files = files.filter((file) => file.path !== path);
    if (activePath === path) activePath = files[0]?.path ?? "";
    scheduleSave();
  }

  onMount(async () => {
    if (!browser) return;

    // A shared link is a visitor's copy of someone else's work: it is not merged with the
    // exercise, and it is not written over whatever this browser had saved for this page.
    const fragment = location.hash.startsWith("#w=") ? location.hash.slice(3) : "";
    const link = fragment ? await decodeShareLink(fragment) : null;

    if (link) {
      shared = true;
      files = link.files;
    } else {
      store = indexedDbStore();
      files = mergeWorkspace(lo, await store.load(courseId, loId));
    }
    activePath = files.find((file) => file.path === lo.entry)?.path ?? files[0]?.path ?? "";

    kernel = new Kernel({ runtime: lo.runtime, onEvent: handleEvent });
    // Bring the frame up now so the engine is downloading while the exercise is being read.
    void kernel.start();
  });

  onDestroy(() => {
    clearTimeout(saveTimer);
    kernel?.dispose();
  });
</script>

<div class="border-surface-200 dark:border-surface-700 overflow-hidden rounded-lg border">
  <div class="bg-surface-200 dark:bg-surface-800 flex flex-wrap items-center gap-2 px-3 py-2">
    <button class="preset-filled-success-500 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50" onclick={() => run("script")} disabled={running}>
      <Iconify icon={running ? "svg-spinners:180-ring" : "fluent:play-24-filled"} width="16" />
      {running ? t("playground.running") : t("playground.run")}
    </button>

    {#if running}
      <button class="bg-surface-300 dark:bg-surface-700 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold" onclick={stop}>
        <Iconify icon="fluent:stop-24-filled" width="16" />
        {t("playground.stop")}
      </button>
    {/if}

    {#if lo.tests}
      <button class="bg-surface-300 dark:bg-surface-700 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50" onclick={() => run("test")} disabled={running}>
        <Iconify icon="fluent:checkmark-circle-24-regular" width="16" />
        {t("playground.runTests")}
      </button>
    {/if}

    <button class="bg-surface-300 dark:bg-surface-700 rounded-md px-3 py-1.5 text-sm font-semibold" onclick={reset}>{t("playground.reset")}</button>
    <button class="bg-surface-300 dark:bg-surface-700 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold" onclick={share}>
      <Iconify icon="fluent:share-24-regular" width="16" />
      {t("playground.share")}
    </button>

    <div class="flex-1"></div>

    <span class="text-surface-600 dark:text-surface-300 text-xs" aria-live="polite">
      {#if statusDetail && running}
        {statusDetail}
      {:else if shareNotice}
        {shareNotice}
      {:else if shared}
        {t("playground.sharedNotice")}
      {:else}
        {saveNotice}
      {/if}
    </span>
    <span class="bg-surface-300 dark:bg-surface-700 rounded-full px-2 py-0.5 text-xs font-semibold">{runtimeLabel(lo.runtime)}</span>
  </div>

  <div class="border-surface-200 dark:border-surface-700 flex flex-wrap items-center gap-1 border-t px-2 py-1">
    {#each files as file (file.path)}
      <span class="flex items-center rounded-t-md {file.path === activePath ? 'bg-surface-100 dark:bg-surface-900 font-semibold' : ''}">
        <button class="px-2 py-1 text-xs" onclick={() => (activePath = file.path)}>
          {file.path}
          {#if isReadOnly(lo, file.path)}<Iconify icon="fluent:lock-closed-16-regular" width="12" class="ml-1 inline" />{/if}
        </button>
        {#if !authoredPaths.has(file.path)}
          <button class="text-surface-500 hover:text-error-500 pr-2 text-xs" onclick={() => deleteFile(file.path)} aria-label={t("playground.deleteFile")}>×</button>
        {/if}
      </span>
    {/each}

    {#if addingFile}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="border-surface-300 dark:border-surface-600 w-40 rounded border px-2 py-0.5 text-xs"
        bind:value={newFileName}
        placeholder={`notes.${runtimeFileExtension(lo.runtime)}`}
        autofocus
        onblur={addFile}
        onkeydown={(event) => {
          if (event.key === "Enter") addFile();
          if (event.key === "Escape") {
            addingFile = false;
            newFileName = "";
          }
        }}
      />
    {:else}
      <button class="text-surface-500 hover:text-primary-500 px-2 py-1 text-xs" onclick={() => (addingFile = true)} aria-label={t("playground.newFile")} title={t("playground.newFile")}>+</button>
    {/if}
  </div>

  {#if activeFile}
    {#key activePath}
      <CodeEditor
        value={activeFile.content}
        language={languageForPath(activePath, lo.runtime)}
        readOnly={activeReadOnly}
        minHeight="18rem"
        onChange={(value) => edit(activePath, value)}
        onRun={() => run("script")}
      />
    {/key}
  {/if}

  <div class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 border-t px-3 py-2">
    <div class="mb-1 flex items-center gap-2">
      <span class="text-surface-500 text-xs font-semibold uppercase">{t("playground.output")}</span>
      {#if lastOk !== null && !running}
        <span class="text-xs {lastOk ? 'text-success-600' : 'text-error-600'}">{lastOk ? t("playground.ok") : t("playground.failed")}</span>
      {/if}
      <div class="flex-1"></div>
      {#if output}
        <button class="text-surface-500 hover:text-primary-500 text-xs" onclick={() => (output = "")}>{t("playground.clear")}</button>
      {/if}
    </div>
    <pre class="max-h-72 overflow-auto font-mono text-sm whitespace-pre-wrap" aria-live="polite">{output || (hasRun && !running ? "" : t("playground.noOutput"))}</pre>
  </div>

  {#if !shared}
    <PlaygroundSnapshot {lo} {files} {activePath} {output} {running} {lastOk} />
  {/if}
</div>
