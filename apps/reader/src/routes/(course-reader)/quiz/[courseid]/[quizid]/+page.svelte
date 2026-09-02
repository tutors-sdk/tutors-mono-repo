<script lang="ts">
  import type { PageData } from "./$types";
  import { getQuizById } from "@tutors/quiz";
  import type { Quiz } from "@tutors/quiz";
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

{#if isLoading}
  <div class="text-center py-12 text-surface-500">Loading quiz...</div>
{:else if quiz}
  <QuizAsync {quiz} />
{:else}
  <div class="text-center py-12 text-error-500">Quiz not found</div>
{/if}
