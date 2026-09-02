<script lang="ts">
  import type { PageData } from "./$types";
  import QuizDashboard from "@tutors/ui-components/quiz/QuizDashboard.svelte";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
</script>

<QuizDashboard />
