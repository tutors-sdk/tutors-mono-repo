<script lang="ts">
  import { onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import type { Scorm } from "@tutors/tutors-model-lib";
  import { tutorsId } from "@tutors/runes";
  import { startScormSession, type ScormSession, type ScormSummary } from "@tutors/scorm";
  import { getScormRecord, upsertScormRecord } from "@tutors/community/utils/supabase-client";

  interface Props {
    lo: Scorm;
  }
  let { lo }: Props = $props();

  /**
   * The iframe is withheld until the API is published on this window.
   *
   * A SCO looks for the run-time during its own load and gives up with an "LMS not found"
   * error if it is missing, so the frame must not exist before the API does. Loading the
   * learner's previous state is a round trip, which is why this is a gate rather than
   * simply ordering two statements.
   */
  let ready = $state(false);
  let error = $state("");
  let isFullscreen = $state(false);

  let session: ScormSession | undefined;

  const courseId = $derived(lo.parentCourse?.courseId ?? "unknown");
  const learnerId = $derived(tutorsId.value?.login ?? "anonymous");
  const learnerName = $derived(tutorsId.value?.name ?? tutorsId.value?.login ?? "Anonymous");

  async function install() {
    if (!lo.scorm) {
      error = "No SCORM package associated with this learning object.";
      return;
    }
    const loId = lo.route;
    session = await startScormSession({
      target: window,
      courseId,
      loId,
      learnerId,
      learnerName,
      version: lo.scormVersion,
      masteryScore: lo.masteryScore,
      loadRemote: () => getScormRecord(courseId, learnerId, loId),
      saveRemote: (cmi: Record<string, string>, summary: ScormSummary) => {
        void upsertScormRecord(courseId, learnerId, loId, lo.scormVersion, cmi, summary);
      }
    });
    ready = true;
  }

  if (browser) {
    void install();
  }

  onDestroy(() => session?.end());
</script>

{#if error}
  <div class="bg-error/10 flex items-center justify-center rounded-lg p-8">
    <p class="text-error">{error}</p>
  </div>
{:else}
  <div class={isFullscreen ? "bg-base-100 fixed inset-0 z-50 flex flex-col" : ""}>
    <div class="bg-surface-200 flex items-center gap-2 rounded-t-lg px-4 py-2">
      <span class="text-sm font-semibold">SCORM {lo.scormVersion}</span>
      <div class="flex-1"></div>
      <button
        class="bg-surface-300 hover:bg-surface-400 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors"
        onclick={() => (isFullscreen = !isFullscreen)}
        aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          {#if isFullscreen}
            <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
          {:else}
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          {/if}
        </svg>
        {isFullscreen ? "Minimize" : "Fullscreen"}
      </button>
    </div>
    {#if ready}
      <iframe
        src={lo.scorm}
        title={lo.title}
        class="w-full border-0 {isFullscreen ? 'flex-1' : 'rounded-b-lg'}"
        style={isFullscreen ? "" : "height: 80vh;"}
        allowfullscreen
      ></iframe>
    {:else}
      <div class="flex items-center justify-center" style="height: 80vh;">
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    {/if}
  </div>
{/if}
