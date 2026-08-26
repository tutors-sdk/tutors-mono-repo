<script lang="ts">
  import type { Composite, Lo } from "@tutors/tutors-model-lib";
  import Panels from "./Panels.svelte";
  import Cards from "./Cards.svelte";
  import Image from "@tutors/ui-primitives/components/Image.svelte";
  import { isEducator, contentLocks } from "@tutors/runes";

  interface Props {
    units: Composite[];
  }
  let { units }: Props = $props();

  function isVisibleLo(lo: Lo): boolean {
    return !lo.hide && !contentLocks.value.get(lo.route);
  }

  function hasVisibleLos(unit: Composite): boolean {
    if (isEducator.value) return true;

    const standardLos: Lo[] = unit.units?.standardLos ?? [];
    if (standardLos.some(isVisibleLo)) return true;

    // Panel LOs are excluded from standardLos — check them or panel-only units stay hidden
    const panels = unit.panels;
    if (!panels) return false;
    const panelLos: Lo[] = [
      ...(panels.panelTalks ?? []),
      ...(panels.panelVideos ?? []),
      ...(panels.panelNotes ?? []),
      ...(panels.panelPodcasts ?? [])
    ];
    return panelLos.some(isVisibleLo);
  }
</script>

<div class="w-full">
  {#each units as unit}
    {#if hasVisibleLos(unit)}
    <div class="relative mb-2 w-full overflow-hidden rounded-xl border-[1px] p-4" style="background-color: light-dark(var(--color-surface-100), var(--color-surface-900)); border-color: var(--color-primary-500);">
      <div class="flex w-full justify-between pb-2">
        <h2 id={unit.id} class="p-2 text-xl font-semibold">
          {unit.title}
        </h2>
        <div class="flex items-center gap-2">
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
