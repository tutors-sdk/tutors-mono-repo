<script lang="ts">
  /**
   * The part of a playground that involves anyone else.
   *
   * Signed out, this is nothing at all: the exercise still runs, still saves and still
   * shares by link. Signed in, a student can hand their workspace to their lecturer, and
   * can choose — separately, and revocably — to let that lecturer read along live. A
   * lecturer sees the other side of the same panel: what has been handed in, and whoever is
   * currently sharing.
   */
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";
  import Iconify from "@iconify/svelte";
  import { t } from "@tutors/i18n";
  import { tutorsId } from "@tutors/runes";
  import type { Playground } from "@tutors/tutors-model-lib";
  import type { RuntimeFile } from "@tutors/runtime";
  import { authedClient, isCourseEducator, savePlaygroundSnapshot } from "@tutors/community/utils/playground-store";
  import { playgroundWatchers, startSharing, stopSharing, type PlaygroundLiveState } from "@tutors/community/services/playground-live";
  import PlaygroundSubmissions from "./PlaygroundSubmissions.svelte";

  interface Props {
    lo: Playground;
    files: RuntimeFile[];
    activePath?: string;
    output?: string;
    running?: boolean;
    lastOk?: boolean | null;
  }
  let { lo, files, activePath = "", output = "", running = false, lastOk = null }: Props = $props();

  const courseId = $derived(lo.parentCourse?.courseId ?? "unknown");
  const loId = $derived(lo.route);

  let enabled = $state(false);
  let educator = $state(false);
  let handingIn = $state(false);
  let handedInAt = $state("");
  let sharingLive = $state(false);

  let send: ((state: PlaygroundLiveState) => void) | undefined;

  async function handIn() {
    handingIn = true;
    const saved = await savePlaygroundSnapshot({
      studentId: tutorsId.value?.login ?? "",
      studentName: tutorsId.value?.name ?? tutorsId.value?.login ?? "",
      courseId,
      loId,
      runtime: lo.runtime,
      entry: lo.entry,
      files: $state.snapshot(files) as RuntimeFile[],
      lastOutput: output,
      lastOk
    });
    handingIn = false;
    handedInAt = saved ? new Date().toLocaleTimeString() : "";
  }

  function toggleLive() {
    sharingLive = !sharingLive;
    if (sharingLive) {
      send = startSharing(courseId, loId);
    } else {
      stopSharing();
      send = undefined;
    }
  }

  // While sharing, every change goes out. The service throttles, so this stays honest
  // about what the student is doing without turning keystrokes into traffic.
  $effect(() => {
    const state = {
      studentId: tutorsId.value?.login ?? "",
      studentName: tutorsId.value?.name ?? tutorsId.value?.login ?? "",
      files: $state.snapshot(files) as RuntimeFile[],
      activePath,
      output,
      running,
      updatedAt: new Date().toISOString()
    };
    if (sharingLive) send?.(state);
  });

  onMount(async () => {
    if (!browser || !tutorsId.value?.login) return;
    enabled = (await authedClient(courseId)) !== null;
    if (enabled) educator = await isCourseEducator(courseId);
  });

  onDestroy(() => {
    if (sharingLive) stopSharing();
  });
</script>

{#if enabled}
  <div class="border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800 border-t px-3 py-2">
    {#if educator}
      <PlaygroundSubmissions {lo} />
    {:else}
      <div class="flex flex-wrap items-center gap-3">
        <button class="preset-filled-primary-500 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50" onclick={handIn} disabled={handingIn}>
          <Iconify icon="fluent:send-24-regular" width="16" />
          {t("playground.handIn")}
        </button>

        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="checkbox" checked={sharingLive} onchange={toggleLive} />
          {t("playground.liveShare")}
        </label>

        <div class="flex-1"></div>

        <span class="text-surface-600 dark:text-surface-300 text-xs" aria-live="polite">
          {#if sharingLive && playgroundWatchers.value > 0}
            <span class="text-primary-600 dark:text-primary-400 font-semibold">{t("playground.liveWatching")}</span>
          {:else if handedInAt}
            {t("playground.handedIn")} {handedInAt}
          {:else}
            {t("playground.handInHint")}
          {/if}
        </span>
      </div>
    {/if}
  </div>
{/if}
