<script lang="ts">
  import type { PageData } from "./$types";
  import { getQuizById, getResponsesForQuiz, isQuizEducator, getQuizUserId } from "@tutors/quiz";
  import type { Quiz, QuizResponse } from "@tutors/quiz";
  import QuizResults from "@tutors/ui-components/quiz/QuizResults.svelte";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();

  let quiz = $state<Quiz | null>(null);
  let responses = $state<QuizResponse[]>([]);
  let isLoading = $state(true);

  const studentId = $derived(isQuizEducator() ? undefined : getQuizUserId());

  $effect(() => {
    Promise.all([
      getQuizById(data.quizId),
      getResponsesForQuiz(data.quizId)
    ]).then(([q, r]) => {
      quiz = q;
      responses = r;
      isLoading = false;
    });
  });
</script>

{#if isLoading}
  <div class="text-center py-12 text-surface-500">Loading results...</div>
{:else if quiz}
  <div class="mx-4 mt-4 max-w-3xl mx-auto">
    <h2 class="text-xl font-bold mb-4">{quiz.title} - Results</h2>
    <QuizResults {quiz} {responses} {studentId} />
  </div>
{:else}
  <div class="text-center py-12 text-error-500">Quiz not found</div>
{/if}
