<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  import type { Lo } from "@tutors/tutors-model-lib";

  import Card from "@tutors/ui/learning-objects/layout/Card.svelte";
  import { scale } from "svelte/transition";
  import { scaleTransition } from "@tutors/ui/navigators/animations";
  import { currentCourse } from "@tutors/runes";
  import { setShowHide } from "@tutors/tutors-model-lib";

  interface Props {
    los?: Lo[];
  }
  let { los = [] }: Props = $props();

  let pinBuffer = "";
  let ignorePin = "";
  let refresh = $state(true);
  let isLoaded = $state(false);
  let hasKeyListener = false;

  function keypressInput(e: KeyboardEvent) {
    pinBuffer = pinBuffer.concat(e.key);
    if (pinBuffer === ignorePin) {
      los.forEach((lo) => {
        lo.hide = false;
        setShowHide(lo, false);
      });
      refresh = !refresh;
    }
  }

  onMount(async () => {
    if (currentCourse?.value?.properties.ignorepin) {
      ignorePin = currentCourse?.value?.properties.ignorepin.toString();
      window.addEventListener("keydown", keypressInput);
      hasKeyListener = true;
    }
    isLoaded = true;
  });

  onDestroy(() => {
    if (hasKeyListener) {
      window.removeEventListener("keydown", keypressInput);
    }
  });
</script>

{#if los.length > 0 && isLoaded}
  <div transition:scale|local={scaleTransition} class="mx-auto mb-2 place-items-center overflow-hidden rounded-xl p-4" style="background-color: light-dark(var(--color-surface-100), var(--color-surface-900));">
    <div class="mx-auto flex flex-wrap justify-center">
      {#key refresh}
        {#each los as lo}
          {#if !lo.hide}
            <div class="flex justify-center">
              <Card
                cardDetails={{
                  route: lo.route,
                  title: lo.title,
                  type: lo.type,
                  summary: lo.summary,
                  img: lo.img,
                  icon: lo.icon,
                  video: lo.video
                }}
              />
            </div>
          {/if}
        {/each}
      {/key}
    </div>
  </div>
{/if}
