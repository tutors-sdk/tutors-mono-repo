<script lang="ts">
  import type { PageData } from "./$types";
  import QuizLiveStudent from "@tutors/ui-components/quiz/QuizLiveStudent.svelte";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
</script>

<QuizLiveStudent sessionId={data.sessionId} />
