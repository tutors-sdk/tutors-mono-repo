<script lang="ts">
  import type { PageData } from "./$types";
  import QuizLiveHost from "@tutors/ui-components/quiz/QuizLiveHost.svelte";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
</script>

<QuizLiveHost sessionId={data.sessionId} />
