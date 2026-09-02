<script lang="ts">
  import type { PageData } from "./$types";
  import QuizCreator from "@tutors/ui-components/quiz/QuizCreator.svelte";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
</script>

<QuizCreator />
