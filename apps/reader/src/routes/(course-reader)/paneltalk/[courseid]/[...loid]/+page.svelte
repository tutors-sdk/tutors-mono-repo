<script lang="ts">
  import type { PageData } from "./$types";
  import Context from "@tutors/ui-components/learning-objects/structure/Context.svelte";
  import TalkClient from "@tutors/ui-components/learning-objects/content/talk/TalkClient.svelte";
  import type { Talk } from "@tutors/tutors-model-lib";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
</script>

<Context lo={data.lo}>
  <TalkClient lo={data.lo as Talk} />
</Context>
