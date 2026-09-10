<script lang="ts">
  /**
   * What a lecturer sees on a playground: the work handed in for it, and anyone sharing now.
   *
   * Read-only by design. A lecturer can look at a student's workspace and run nothing —
   * the point is to see what the student wrote and what it printed when they ran it, which
   * is the conversation worth having in a lab.
   */
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";
  import Iconify from "@iconify/svelte";
  import { t } from "@tutors/i18n";
  import type { Playground } from "@tutors/tutors-model-lib";
  import { languageForPath } from "@tutors/runtime";
  import { listPlaygroundSnapshots, type PlaygroundSnapshot } from "@tutors/community/utils/playground-store";
  import { playgroundShared, startWatching, stopWatching } from "@tutors/community/services/playground-live";
  import CodeEditor from "../code/CodeEditor.svelte";

  interface Props {
    lo: Playground;
  }
  let { lo }: Props = $props();

  const courseId = $derived(lo.parentCourse?.courseId ?? "unknown");
  const loId = $derived(lo.route);

  let snapshots = $state<PlaygroundSnapshot[]>([]);
  let loading = $state(true);
  let openStudent = $state("");
  let openPath = $state("");
  let watching = $state(false);

  /** A live sharer supersedes their own handed-in copy: it is the same student, more recent. */
  const live = $derived([...playgroundShared.value.values()]);
  const liveIds = $derived(new Set(live.map((state) => state.studentId)));

  const opened = $derived.by(() => {
    const fromLive = live.find((state) => state.studentId === openStudent);
    if (fromLive) {
      return { files: fromLive.files, output: fromLive.output, entry: fromLive.activePath, name: fromLive.studentName, isLive: true };
    }
    const snapshot = snapshots.find((candidate) => candidate.studentId === openStudent);
    if (!snapshot) return null;
    return { files: snapshot.files, output: snapshot.lastOutput, entry: snapshot.entry, name: snapshot.studentName, isLive: false };
  });

  function open(studentId: string, entry: string) {
    openStudent = openStudent === studentId ? "" : studentId;
    openPath = entry;
  }

  function toggleWatch() {
    watching = !watching;
    if (watching) startWatching(courseId, loId);
    else stopWatching();
  }

  async function refresh() {
    loading = true;
    snapshots = await listPlaygroundSnapshots(courseId, loId);
    loading = false;
  }

  onMount(() => {
    if (browser) void refresh();
  });

  onDestroy(() => {
    if (watching) stopWatching();
  });
</script>

<div class="flex flex-wrap items-center gap-3">
  <span class="text-sm font-semibold">{t("playground.submissions")}</span>
  <button class="bg-surface-300 dark:bg-surface-700 rounded-md px-2 py-1 text-xs font-semibold" onclick={refresh}>{t("playground.refresh")}</button>
  <label class="flex items-center gap-2 text-sm">
    <input type="checkbox" class="checkbox" checked={watching} onchange={toggleWatch} />
    {t("playground.watchLive")}
  </label>
  <div class="flex-1"></div>
  <span class="text-surface-600 dark:text-surface-300 text-xs">
    {#if loading}
      …
    {:else}
      {snapshots.length}
    {/if}
  </span>
</div>

{#if !loading && snapshots.length === 0 && live.length === 0}
  <p class="text-surface-500 mt-2 text-xs">{t("playground.noSubmissions")}</p>
{/if}

<ul class="mt-2 space-y-1">
  {#each live as state (state.studentId)}
    <li>
      <button class="hover:bg-surface-200 dark:hover:bg-surface-700 flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm" onclick={() => open(state.studentId, state.activePath)}>
        <Iconify icon="fluent:record-24-filled" width="14" class="text-error-500" />
        <span class="font-semibold">{state.studentName}</span>
        <span class="text-surface-500 text-xs">{t("playground.liveNow")}</span>
      </button>
    </li>
  {/each}

  {#each snapshots.filter((snapshot) => !liveIds.has(snapshot.studentId)) as snapshot (snapshot.studentId)}
    <li>
      <button class="hover:bg-surface-200 dark:hover:bg-surface-700 flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm" onclick={() => open(snapshot.studentId, snapshot.entry)}>
        <Iconify icon={snapshot.lastOk === null ? "fluent:document-24-regular" : snapshot.lastOk ? "fluent:checkmark-circle-24-filled" : "fluent:dismiss-circle-24-filled"} width="14" class={snapshot.lastOk === false ? "text-error-500" : "text-success-500"} />
        <span class="font-semibold">{snapshot.studentName}</span>
        <span class="text-surface-500 text-xs">{new Date(snapshot.updatedAt).toLocaleString()}</span>
      </button>
    </li>
  {/each}
</ul>

{#if opened}
  <div class="border-surface-300 dark:border-surface-600 mt-2 rounded border">
    <div class="bg-surface-200 dark:bg-surface-700 flex flex-wrap items-center gap-1 px-2 py-1">
      <span class="mr-2 text-xs font-semibold">{opened.name}</span>
      {#each opened.files as file (file.path)}
        <button class="rounded px-2 py-0.5 text-xs {file.path === openPath ? 'bg-surface-100 dark:bg-surface-900 font-semibold' : ''}" onclick={() => (openPath = file.path)}>{file.path}</button>
      {/each}
    </div>
    {#key `${openStudent}:${openPath}`}
      <CodeEditor value={opened.files.find((file) => file.path === openPath)?.content ?? ""} language={languageForPath(openPath, lo.runtime)} readOnly minHeight="12rem" />
    {/key}
    {#if opened.output}
      <pre class="bg-surface-50 dark:bg-surface-900 max-h-40 overflow-auto border-t px-3 py-2 font-mono text-xs whitespace-pre-wrap">{opened.output}</pre>
    {/if}
  </div>
{/if}
