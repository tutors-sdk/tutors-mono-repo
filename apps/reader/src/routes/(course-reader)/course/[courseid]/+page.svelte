<script lang="ts">
  import Composite from "@tutors/ui-components/learning-objects/structure/Composite.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
</script>

<Composite composite={data.course} />
