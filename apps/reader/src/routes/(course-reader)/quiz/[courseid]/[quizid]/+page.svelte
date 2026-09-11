<script lang="ts">
  import type { PageData } from "./$types";
  import { getQuizById } from "@tutors/quiz";
  import type { Quiz } from "@tutors/quiz";
    import Context from "@tutors/ui-components/learning-objects/structure/Context.svelte";
  import QuizAsync from "@tutors/ui-components/quiz/QuizAsync.svelte";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();

  let quiz = $state<Quiz | null>(null);
  let isLoading = $state(true);

  $effect(() => {
    getQuizById(data.quizId).then((q) => {
      quiz = q;
      isLoading = false;
    });
  });
</script>

<Context lo={data.course}>
  {#if isLoading}
    <div class="text-center py-12 text-surface-500">Loading quiz...</div>
  {:else if quiz}
    <QuizAsync {quiz} />
  {:else}
    <div class="text-center py-12 text-error-500">
      Quiz not found. Open the note that contains this quiz first, then try again.
    </div>
  {/if}
</Context>