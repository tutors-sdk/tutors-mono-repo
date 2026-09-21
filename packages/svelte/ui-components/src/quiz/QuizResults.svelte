<script lang="ts">
  import { scoreQuiz, type ParsedQuiz, type QuizAnswers } from "@tutors/quiz";
  import QuizQuestion from "./QuizQuestion.svelte";

  interface Props {
    quiz: ParsedQuiz;
    /** Question id to the index of the option the student chose. */
    answers: QuizAnswers;
  }

  let { quiz, answers }: Props = $props();

  let score = $derived(scoreQuiz(quiz, answers));
</script>

<div class="space-y-6">
  <p role="status" class="sr-only">You answered {score.correct} of {score.total} questions correctly. {score.percentage}%.</p>
  <div class="grid grid-cols-2 gap-4">
    <div class="ui-panel text-center">
      <div class="text-primary-500 text-3xl font-bold">{score.correct}/{score.total}</div>
      <div class="text-surface-500 text-sm">Your Score</div>
    </div>
    <div class="ui-panel text-center">
      <div
        class="text-3xl font-bold {score.percentage >= 70
          ? 'text-success-500'
          : score.percentage >= 40
            ? 'text-warning-500'
            : 'text-error-500'}"
      >
        {score.percentage}%
      </div>
      <div class="text-surface-500 text-sm">Correct</div>
    </div>
  </div>

  <div class="space-y-6">
    {#each quiz.questions as question, i (question.id)}
      <div class="ui-panel">
        <QuizQuestion
          questionIndex={i}
          text={question.text}
          options={question.options}
          questionType={question.type}
          selectedIndex={answers[question.id] ?? null}
          disabled={true}
          showCorrect={true}
          correctIndex={question.correctIndex}
        />
      </div>
    {/each}
  </div>
</div>
