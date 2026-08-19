<script lang="ts">
  import type { Composite } from "@tutors/tutors-model-lib";
  import Panels from "./Panels.svelte";
  import Cards from "./Cards.svelte";
  import Image from "@tutors/ui-primitives/components/Image.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { isEducator, contentLocks, locksLoaded, currentCourse } from "@tutors/runes";
  import { rbacService } from "@tutors/rbac";

  interface Props {
    units: Composite[];
  }
  let { units }: Props = $props();
</script>

{#if isEducator.value || !currentCourse.value?.hasEnrollment || locksLoaded.value}
<div class="w-full">
  {#each units as unit}
    {#if !(contentLocks.value.get(unit.route) && !isEducator.value)}
      <div class="relative mb-2 w-full overflow-hidden rounded-xl border-[1px] p-4" style="background-color: light-dark(var(--color-surface-100), var(--color-surface-900)); border-color: var(--color-primary-500);">
        <div class="flex w-full justify-between pb-2">
          <h2 id={unit.id} class="p-2 text-xl font-semibold">
            {unit.title}
          </h2>
          <div class="flex items-center gap-2">
            {#if isEducator.value && contentLocks.value.get(unit.route)}
              <button
                class="rounded-lg bg-surface-200 p-1 opacity-70 transition-opacity hover:opacity-100 dark:bg-surface-700"
                onclick={() => rbacService.toggleContentLock(unit.route, !contentLocks.value.get(unit.route))}
              >
                <Icon type="lock" height="20" />
              </button>
            {/if}
            <Image lo={unit.parentTopic ? unit.parentTopic : unit.parentLo} miniImage={true} />
          </div>
        </div>
        <Panels panels={unit.panels} />
        <div class="w-full">
          <Cards los={unit.units.standardLos} />
        </div>
      </div>
    {/if}
  {/each}
</div>
{/if}
