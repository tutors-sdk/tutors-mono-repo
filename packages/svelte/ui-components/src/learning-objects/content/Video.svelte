<script lang="ts">
  import { onMount } from "svelte";
  import type { Lo } from "@tutors/tutors-model-lib";
  import { currentCourse } from "@tutors/runes";
  import { getVideoConfig } from "@tutors/tutors-model-lib";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";

  interface Props {
    lo: Lo;
    autoplay?: boolean;
  }
  let { lo = $bindable() }: Props = $props();

  let showVime = $state(false);

  onMount(() => {
    setTimeout(() => {
      showVime = true;
    }, 500);
  });

  let videoConfig = $derived(getVideoConfig(lo));
</script>

{#if !currentCourse?.value?.areVideosHidden}
  <div class="ui-panel w-full">
    {#if videoConfig.service === "heanet" && showVime}
      <div class="relative mx-auto aspect-video w-full" style="">
        <iframe title={lo.title} class="absolute inset-0 h-full w-full" src={videoConfig.url} allow="encrypted-media" allowfullscreen></iframe>
      </div>
    {:else if videoConfig.service === "vimp"}
      <iframe
        title={lo.title}
        src={videoConfig.url}
        class="iframeLoaded block mx-auto aspect-video h-auto w-full"
        width="720"
        height="405"
        aria-label="media embed code"
        allowtransparency={true}
        allowfullscreen
      ></iframe>
    {:else if videoConfig.service === "panopto"}
      <div class="relative mx-auto w-full max-w-5xl" style="aspect-ratio: 16/9;">
        <iframe
          title={lo.title}
          class="absolute inset-0 h-full w-full border border-[#464646] box-border"
          src={videoConfig.url}
          allow="autoplay"
          allowfullscreen
          aria-label="Panopto Embedded Video Player"
        ></iframe>
      </div>
    {:else}
      <!-- <div class="relative mx-auto aspect-video w-full" style=""> -->
      <div class="relative w-full" style="aspect-ratio: 16/9;">
        <iframe title={lo.title} class="absolute inset-0 h-full w-full" src={videoConfig.url} allow="encrypted-media" allowfullscreen></iframe>
      </div>
    {/if}
    <br />
    <p class="mt-4 text-lg font-semibold">{lo.title}</p>
    <div class="prose dark:prose-invert text-sm">
      {@html sanitizeHtml(lo.summary ?? "")}
    </div>
  </div>
{/if}
