<script lang="ts">
  import type { PageData } from "./$types";
  import Context from "@tutors/ui-components/learning-objects/structure/Context.svelte";
  import WhiteboardViewer from "@tutors/ui-components/learning-objects/content/whiteboard/WhiteboardViewer.svelte";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
</script>

<Context lo={data.lo}>
  <WhiteboardViewer lo={data.lo} />
</Context>
