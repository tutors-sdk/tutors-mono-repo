<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  import type { Lo } from "@tutors/tutors-model-lib";

  import Card from "@tutors/ui-components/learning-objects/layout/Card.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { currentCourse, isEducator, contentLocks, locksLoaded } from "@tutors/runes";
  import { setShowHide } from "@tutors/tutors-model-lib";
  import { rbacService } from "@tutors/rbac";

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

{#if los.length > 0 && isLoaded && (isEducator.value || !currentCourse.value?.hasEnrollment || locksLoaded.value)}
  <div class="w-full">
    <div class="ui-grid">
      {#key refresh}
        {#each los as lo}
          {@const row = !currentCourse.value?.isPortfolio && lo.type !== "topic"}
          {#if !lo.hide && !(rbacService.isLoLocked(lo) && !isEducator.value)}
            <div class="relative min-w-0" class:resource-row={row}>
              <Card
                {row}
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
              {#if isEducator.value && contentLocks.value.get(lo.route)}
                <button
                  aria-label="Unlock {lo.title}"
                  class="absolute top-2 right-2 z-20 rounded-lg bg-surface-200 p-1 opacity-70 transition-opacity hover:opacity-100 dark:bg-surface-700"
                  onclick={() => rbacService.toggleContentLock(lo.route, !contentLocks.value.get(lo.route))}
                >
                  <Icon type="lock" height="20" />
                </button>
              {/if}
            </div>
          {/if}
        {/each}
      {/key}
    </div>
  </div>
{/if}

<style>
  .ui-grid { grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); }
  .resource-row { grid-column: 1 / -1; }
</style>
