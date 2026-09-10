<script lang="ts">
  import type { Lo } from "@tutors/tutors-model-lib";
  import LoReference from "@tutors/ui-primitives/components/LoReference.svelte";
  import Self from "./LoContext.svelte";
  import { rbacService } from "@tutors/rbac";

  let { lo, indent = 0 }: { lo: Lo; indent: number } = $props();

  if (lo?.toc) {
    lo.toc.forEach((child: Lo) => {
      if (child.route.endsWith("/")) {
        child.route = child.route.slice(0, -1);
      }
      if ((child.type === "unit" || child.type === "side") && child.parentLo?.type === "course") {
        lo.route = lo.route.replace("topic", "course");
      }
    });
  }

  let visibleChildren = $derived((lo?.toc ?? []).filter((child) => rbacService.isLoVisibleToStudent(child)));
</script>

{#each visibleChildren as childLo}
  <LoReference lo={childLo} indent={indent + 2} />
  {#if childLo?.toc}
    <Self lo={childLo} indent={indent + 2} />
  {/if}
{/each}
