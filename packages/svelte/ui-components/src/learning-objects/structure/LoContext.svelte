<script lang="ts">
  import type { Lo, Composite } from "@tutors/tutors-model-lib";
  import LoReference from "@tutors/ui-primitives/components/LoReference.svelte";
  import Self from "./LoContext.svelte";

  let { lo, indent = 0 }: { lo: Lo; indent: number } = $props();

  const compositeLo = lo as Composite;

  if (compositeLo?.toc) {
    compositeLo.toc.forEach((child: Lo) => {
      if (child.route.endsWith("/")) {
        child.route = child.route.slice(0, -1);
      }
      if ((child.type === "unit" || child.type === "side") && child.parentLo?.type === "course") {
        lo.route = lo.route.replace("topic", "course");
      }
    });
  }
</script>

{#each compositeLo?.toc ?? [] as childLo}
  <LoReference lo={childLo} />
  {#if (childLo as Composite)?.toc}
    <Self lo={childLo} indent={indent + 2} />
  {/if}
{/each}
