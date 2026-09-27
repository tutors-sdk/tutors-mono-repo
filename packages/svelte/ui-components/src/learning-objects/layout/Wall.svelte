<script lang="ts">
  import type { Lo } from "@tutors/tutors-model-lib";
  import Cards from "../layout/Cards.svelte";
  import Video from "../content/Video.svelte";
  import { currentCourse, isEducator, locksLoaded } from "@tutors/runes";
  import { rbacService } from "@tutors/rbac";
  import SecondaryNavigator from "@tutors/ui-navigators/SecondaryNavigator.svelte";
  import { t } from "@tutors/i18n";
  import Podcast from "../content/Podcast.svelte";

  interface Props {
    los: Lo[];
    type: string;
  }
  let { los, type }: Props = $props();

  let visibleLos = $derived(
    los.filter((lo) => rbacService.isLoVisibleToStudent(lo)),
  );
  let panelVideos = $derived(visibleLos.filter((lo) => lo.type === "panelvideo"));
  let talkVideos = $derived(visibleLos.filter((lo) => lo.type !== "panelvideo"));
  let locksReady = $derived(
    isEducator.value || !currentCourse.value?.hasEnrollment || locksLoaded.value,
  );
</script>

<SecondaryNavigator lo={currentCourse.value} parentCourse={currentCourse.value?.properties?.parent} />
<div class="ui-page">
  <p class="ui-eyebrow">{t("shell.resources")}</p>
  <h1 class="ui-title wall-title capitalize">{type}</h1>
  {#key los}
    {#if type !== "video" && type !== "podcast"}
      <Cards {los} />
    {:else if locksReady}
      {#if type === "podcast"}
        <div class="ui-grid">
          {#each visibleLos as lo}<Podcast {lo} hideSummary={true} />{/each}
        </div>
      {:else}
        <div class="flex flex-wrap justify-center">
          {#each panelVideos as lo}
            <div class="flex justify-center">
              <Video {lo} />
            </div>
          {/each}
        </div>
        <div class="flex flex-wrap justify-center">
          {#each talkVideos as lo}
            <div class="flex justify-center">
              <Video {lo} />
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/key}
</div>
<style>
  .wall-title { margin-block: var(--space-2) var(--space-6); }
</style>
