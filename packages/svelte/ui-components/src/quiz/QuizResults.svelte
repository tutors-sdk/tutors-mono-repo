<script lang="ts">
  import type { Quiz, QuizResponse } from "@tutors/quiz";
  import QuizQuestion from "./QuizQuestion.svelte";

  interface Props {
    quiz: Quiz;
    responses: QuizResponse[];
  }

  let { quiz, responses }: Props = $props();

  function answerFor(questionId: string): QuizResponse | null {
    return responses.find((r) => r.questionId === questionId) ?? null;
  }

  const correct = $derived(responses.filter((r) => r.isCorrect).length);
  const total = $derived(quiz.questions.length);
  const pct = $derived(total > 0 ? Math.round((correct / total) * 100) : 0);
</script>

<div class="space-y-6">
  <div class="grid grid-cols-2 gap-4">
    <div class="border-primary-500 bg-surface-100 dark:bg-surface-900 rounded-xl border-[1px] p-4 text-center">
      <div class="text-3xl font-bold text-primary-500">{correct}/{total}</div>
      <div class="text-sm text-surface-500">Your Score</div>
    </div>
    <div class="border-primary-500 bg-surface-100 dark:bg-surface-900 rounded-xl border-[1px] p-4 text-center">
      <div class="text-3xl font-bold {pct >= 70 ? 'text-success-500' : pct >= 40 ? 'text-warning-500' : 'text-error-500'}">
        {pct}%
      </div>
      <div class="text-sm text-surface-500">Correct</div>
    </div>
  </div>

  <div class="space-y-6">
    {#each quiz.questions as question, i}
      {@const response = answerFor(question.id)}
      <div class="border-primary-500 bg-surface-100 dark:bg-surface-900 rounded-xl border-[1px] p-4">
        <QuizQuestion
          questionIndex={i}
          text={question.text}
          options={question.options}
          questionType={question.type}
          selectedIndex={response ? response.selectedIndex : null}
          disabled={true}
          showCorrect={true}
          correctIndex={question.correctIndex}
        />
      </div>
    {/each}
  </div>
</div>
