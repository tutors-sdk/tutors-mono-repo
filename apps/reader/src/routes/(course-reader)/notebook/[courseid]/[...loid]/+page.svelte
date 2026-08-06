<script lang="ts">
  import type { PageData } from "./$types";
  import Context from "@tutors/ui-components/learning-objects/structure/Context.svelte";
  import Notebook from "@tutors/ui-components/learning-objects/content/notebook/Notebook.svelte";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
</script>

<Context lo={data.notebook.notebook}>
  <Notebook notebook={data.notebook} />
</Context>
