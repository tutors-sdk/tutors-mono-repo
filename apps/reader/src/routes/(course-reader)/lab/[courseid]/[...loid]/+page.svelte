<script lang="ts">
  import type { PageData } from "./$types";
  import Lab from "@tutors/ui-components/learning-objects/content/lab/Lab.svelte";
  import Context from "@tutors/ui-components/learning-objects/structure/Context.svelte";
  import TalkClient from "@tutors/ui-components/learning-objects/content/talk/TalkClient.svelte";
  import type { Talk } from "@tutors/tutors-model-lib";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
</script>

{#if data.lab.lab.pdf}
  <Context lo={data.lab.lab}>
    <TalkClient lo={data.lab.lab as unknown as Talk} />
  </Context>
{:else}
  <Context lo={data.lab.lab}>
    <Lab lab={data.lab} />
  </Context>
{/if}
