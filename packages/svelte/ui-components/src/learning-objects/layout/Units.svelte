<script lang="ts">
  import type { Composite, Lo } from "@tutors/tutors-model-lib";
  import Panels from "./Panels.svelte";
  import Cards from "./Cards.svelte";
  import Image from "@tutors/ui-primitives/components/Image.svelte";
  import { isEducator } from "@tutors/runes";
  import { rbacService } from "@tutors/rbac";

  interface Props {
    units: Composite[];
  }
  let { units }: Props = $props();

  function isVisibleLo(lo: Lo): boolean {
    return !lo.hide && !rbacService.isLoLocked(lo);
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
    <div class="relative mb-8 w-full min-w-0">
      <div class="flex w-full justify-between pb-2">
        <h2 id={unit.id} class="p-2 text-xl font-semibold">
          {unit.title}
        </h2>
        <div class="flex items-center gap-2">
          {#if unit.img || unit.icon}<Image lo={unit} miniImage />{/if}
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
