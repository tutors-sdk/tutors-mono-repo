<script lang="ts">
  import type { Composite } from "@tutors/tutors-model-lib";
  import Panels from "./Panels.svelte";
  import Cards from "./Cards.svelte";
  import Image from "@tutors/ui-primitives/components/Image.svelte";

  interface Props {
    units: Composite[];
  }
  let { units }: Props = $props();
</script>

<div class="w-full">
  {#each units as unit}
    <div class="mb-2 w-full overflow-hidden rounded-xl border-[1px] p-4" style="background-color: light-dark(var(--color-surface-100), var(--color-surface-900)); border-color: var(--color-primary-500);">
      <div class="flex w-full justify-between pb-2">
        <h2 id={unit.id} class="p-2 text-xl font-semibold">
          {unit.title}
        </h2>
        <Image lo={unit.parentTopic ? unit.parentTopic : unit.parentLo} miniImage={true} />
      </div>
      <Panels panels={unit.panels} />
      <div class="w-full">
        <Cards los={unit.units.standardLos} />
      </div>
    </div>
  {/each}
</div>
