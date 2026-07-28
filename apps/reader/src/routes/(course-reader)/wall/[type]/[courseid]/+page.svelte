<script lang="ts">
  import type { PageData } from "./$types";
  import Wall from "@tutors/ui-components/learning-objects/layout/Wall.svelte";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
</script>

<Wall los={data.los} type={data.type} />
