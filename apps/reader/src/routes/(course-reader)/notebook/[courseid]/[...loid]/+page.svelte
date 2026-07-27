<script lang="ts">
  import type { PageData } from "./$types";
  import Context from "@tutors/ui/learning-objects/structure/Context.svelte";
  import Notebook from "@tutors/ui/learning-objects/content/notebook/Notebook.svelte";
  import { hideMainNavigator } from "@tutors/runes";
  import { onDestroy, onMount } from "svelte";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();

  // onMount(() => {
  //   hideMainNavigator.value = true;
  // });
  // onDestroy(() => {
  //   hideMainNavigator.value = false;
  // });
</script>

<Context lo={data.notebook.notebook}>
  <Notebook notebook={data.notebook} />
</Context>
