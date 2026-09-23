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
      <div class="quiz-score">{score.correct}/{score.total}</div>
      <div class="ui-muted quiz-label">Your Score</div>
    </div>
    <div class="ui-panel text-center">
      <div class="quiz-score" class:good={score.percentage >= 70} class:fair={score.percentage >= 40 && score.percentage < 70} class:poor={score.percentage < 40}>
        {score.percentage}%
      </div>
      <div class="ui-muted quiz-label">Correct</div>
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
<style>
  .quiz-score { font-size: var(--font-title); font-weight: var(--weight-semibold); color: var(--ui-brand); }
  .quiz-score.good { color: var(--ui-success); }
  .quiz-score.fair { color: var(--ui-warning); }
  .quiz-score.poor { color: var(--ui-danger); }
  .quiz-label { font-size: var(--font-label); }
</style>
