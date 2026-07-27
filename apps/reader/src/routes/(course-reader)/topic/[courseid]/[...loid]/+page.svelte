<script lang="ts">
  import type { PageData } from "./$types";
  import Composite from "@tutors/ui/learning-objects/structure/Composite.svelte";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
</script>

<Composite composite={data.topic} />
