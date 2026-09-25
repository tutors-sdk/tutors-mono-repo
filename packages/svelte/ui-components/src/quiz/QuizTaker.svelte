<script lang="ts">
  import { isQuizComplete, type ParsedQuiz, type QuizAnswers } from "@tutors/quiz";
  import { beforeNavigate } from "$app/navigation";
  import { tick } from "svelte";
  import QuizQuestion from "./QuizQuestion.svelte";
  import QuizResults from "./QuizResults.svelte";

  interface Props {
    quiz: ParsedQuiz;
    /** Shown when the quiz block declares no title of its own. */
    fallbackTitle: string;
  }

  let { quiz, fallbackTitle }: Props = $props();

  // Answers are held in memory only: leaving the page discards them. Recording
  // them is a separate concern, and needs a Supabase session to write with.
  let answers = $state<QuizAnswers>({});
  let currentIndex = $state(0);
  let submitted = $state(false);

  let title = $derived(quiz.title ?? fallbackTitle);
  let currentQuestion = $derived(quiz.questions[currentIndex]);
  let allAnswered = $derived(isQuizComplete(quiz, answers));
  let answeredCount = $derived(Object.keys(answers).length);
  let progress = $derived((answeredCount / quiz.questions.length) * 100);
  let heading = $state<HTMLHeadingElement>();
  beforeNavigate(({ cancel, willUnload }) => {
    if (answeredCount && !submitted) {
      if (willUnload || !window.confirm("Leave this quiz? Your answers will be lost.")) cancel();
    }
  });
  async function submit() { submitted = true; await tick(); heading?.focus(); }

  function select(questionId: string, index: number) {
    if (submitted) return;
    answers[questionId] = index;
  }

  function goTo(index: number) {
    currentIndex = Math.min(Math.max(index, 0), quiz.questions.length - 1);
    tick().then(() => heading?.focus());
  }

  async function retake() {
    answers = {};
    currentIndex = 0;
    submitted = false;
    await tick(); heading?.focus();
  }

</script>

{#if submitted}
  <div class="mt-4 space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h2 bind:this={heading} tabindex="-1" class="ui-section-title">{title} — Results</h2>
      <button
        class="ui-button"
        onclick={retake}
      >
        Retake
      </button>
    </div>
    <QuizResults {quiz} {answers} />
  </div>
{:else}
  <div class="mt-4 space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h2 bind:this={heading} tabindex="-1" class="ui-section-title">{title}</h2>
      <span class="ui-muted quiz-meta">
        Question {currentIndex + 1} of {quiz.questions.length}
      </span>
    </div>

    <div
      class="quiz-progress"
      role="progressbar"
      aria-valuenow={answeredCount}
      aria-valuemin={0}
      aria-valuemax={quiz.questions.length}
      aria-label="Questions answered"
    >
      <div style="width: {progress}%"></div>
    </div>

    <p class="ui-muted quiz-meta" aria-live="polite">{answeredCount} of {quiz.questions.length} answered</p>
    <div class="ui-panel">
      <QuizQuestion
        questionIndex={currentIndex}
        text={currentQuestion.text}
        options={currentQuestion.options}
        questionType={currentQuestion.type}
        selectedIndex={answers[currentQuestion.id] ?? null}
        disabled={false}
        showCorrect={false}
        onselect={(index) => select(currentQuestion.id, index)}
      />
    </div>

    <div class="flex flex-wrap items-center justify-between gap-4">
      <button
        class="ui-button"
        onclick={() => goTo(currentIndex - 1)}
        disabled={currentIndex === 0}
      >
        Previous
      </button>

      <div class="flex flex-wrap gap-2">
        {#each quiz.questions as question, i (question.id)}
          <button class="ui-button quiz-step" class:answered={answers[question.id] !== undefined} onclick={() => goTo(i)} aria-current={i === currentIndex ? "step" : undefined} aria-label="Go to question {i + 1}">
            {i + 1}
          </button>
        {/each}
      </div>

      {#if currentIndex === quiz.questions.length - 1}
        <button
          class="ui-button ui-button-primary"
          onclick={submit}
          disabled={!allAnswered}
        >
          Submit
        </button>
      {:else}
        <button class="ui-button ui-button-primary" onclick={() => goTo(currentIndex + 1)}>
          Next
        </button>
      {/if}
    </div>
  </div>
{/if}
<style>
  .quiz-meta { font-size: var(--font-label); }
  .quiz-progress { height: 8px; width: 100%; border-radius: 999px; background: var(--ui-raised); }
  .quiz-progress > div { height: 100%; border-radius: inherit; background: var(--ui-brand); transition: width 150ms; }
  .quiz-step { min-width: 44px; font-size: var(--font-label); }
  .quiz-step:not(.answered):not([aria-current]) { color: var(--ui-muted); }
  @media (prefers-reduced-motion: reduce) { .quiz-progress > div { transition: none; } }
</style>
