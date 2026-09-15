<script lang="ts">
  import type { Lo } from "@tutors/tutors-model-lib";
  import Cards from "../layout/Cards.svelte";
  import Video from "../content/Video.svelte";
  import { currentCourse, isEducator, locksLoaded } from "@tutors/runes";
  import { rbacService } from "@tutors/rbac";
  import SecondaryNavigator from "@tutors/ui-navigators/SecondaryNavigator.svelte";
  import Podcast from "../content/Podcast.svelte";

  interface Props {
    los: Lo[];
    type: string;
  }
  let { los, type }: Props = $props();

  let visibleLos = $derived(
    isEducator.value ? los : los.filter((lo) => !rbacService.isLoLocked(lo)),
  );
  let panelVideos = $derived(visibleLos.filter((lo) => lo.type === "panelvideo"));
  let talkVideos = $derived(visibleLos.filter((lo) => lo.type !== "panelvideo"));
  let locksReady = $derived(
    isEducator.value || !currentCourse.value?.hasEnrollment || locksLoaded.value,
  );
</script>

<SecondaryNavigator lo={currentCourse.value} parentCourse={currentCourse.value?.properties?.parent} />
<div class="flex flex-wrap justify-center">
  {#key los}
    {#if type !== "video" && type !== "podcast"}
      <Cards {los} />
    {:else if locksReady}
      {#if type === "podcast"}
        <div class="grid grid-cols-1 gap-6 p-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {#each visibleLos as lo}
            <div class="flex justify-center">
              <Podcast {lo} hideSummary={true} />
            </div>
          {/each}
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
