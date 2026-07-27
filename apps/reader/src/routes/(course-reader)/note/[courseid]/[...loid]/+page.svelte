<script lang="ts">
  import type { PageData } from "./$types";
  import Context from "@tutors/ui/learning-objects/structure/Context.svelte";
  import Note from "@tutors/ui/learning-objects/content/Note.svelte";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
</script>

<Context lo={data.lo}>
  <Note lo={data.lo} />
</Context>
