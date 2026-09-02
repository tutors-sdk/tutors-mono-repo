<script lang="ts">
  import type { PageData } from "./$types";
  import Context from "@tutors/ui-components/learning-objects/structure/Context.svelte";
  import QuizLo from "@tutors/ui-components/quiz/QuizLo.svelte";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
</script>

<Context lo={data.lo}>
  <QuizLo lo={data.lo} />
</Context>
