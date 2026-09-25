<script lang="ts">
  import { currentLo } from "@tutors/runes";
  import type { Lo } from "@tutors/tutors-model-lib";
  import Image from "@tutors/ui-primitives/components/Image.svelte";
  import LoContext from "../structure/LoContext.svelte";
  import LoContextTree from "@tutors/ui-primitives/components/LoContextTree.svelte";

  interface Props {
    loContext: Lo;
  }
  let { loContext }: Props = $props();

  let headingText = "text-md font-semibold";
  let cardWidths = "w-72";
</script>

<div class="ui-panel {cardWidths} max-w-full">
  <h3 class="px-4 py-2 text-center {headingText}">{loContext?.title}</h3>
  <div class="card-body overflow-y-auto">
    <figure class="flex h-44 justify-center p-2">
      <Image lo={currentLo?.value} />
    </figure>
    <LoContextTree lo={loContext} expandAll={false} />
  </div>
</div>
