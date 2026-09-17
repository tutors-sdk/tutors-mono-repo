<script lang="ts">
  import { isQuizComplete, type ParsedQuiz, type QuizAnswers } from "@tutors/quiz";
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
  let progress = $derived(((currentIndex + 1) / quiz.questions.length) * 100);

  function select(questionId: string, index: number) {
    if (submitted) return;
    answers[questionId] = index;
  }

  function goTo(index: number) {
    currentIndex = Math.min(Math.max(index, 0), quiz.questions.length - 1);
  }

  function retake() {
    answers = {};
    currentIndex = 0;
    submitted = false;
  }

  function stepClass(index: number): string {
    const base = "h-8 w-8 rounded-full text-xs font-medium transition-colors";
    if (index === currentIndex) return `${base} bg-primary-500 text-white`;
    if (answers[quiz.questions[index].id] !== undefined) {
      return `${base} bg-primary-200 dark:bg-primary-800 text-primary-700 dark:text-primary-300`;
    }
    return `${base} bg-surface-200 dark:bg-surface-700 text-surface-500`;
  }
</script>

{#if submitted}
  <div class="mt-4 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold">{title} — Results</h2>
      <button
        class="border-surface-300 dark:border-surface-600 hover:bg-surface-200 dark:hover:bg-surface-800 rounded-lg border px-4 py-2 text-sm"
        onclick={retake}
      >
        Retake
      </button>
    </div>
    <QuizResults {quiz} {answers} />
  </div>
{:else}
  <div class="mt-4 space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold">{title}</h2>
      <span class="text-surface-500 text-sm">
        Question {currentIndex + 1} of {quiz.questions.length}
      </span>
    </div>

    <div
      class="bg-surface-200 dark:bg-surface-700 h-2 w-full rounded-full"
      role="progressbar"
      aria-valuenow={currentIndex + 1}
      aria-valuemin={1}
      aria-valuemax={quiz.questions.length}
      aria-label="Quiz progress"
    >
      <div class="bg-primary-500 h-2 rounded-full transition-all" style="width: {progress}%"></div>
    </div>

    <div class="border-primary-500 bg-surface-100 dark:bg-surface-900 rounded-xl border p-6">
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

    <div class="flex items-center justify-between">
      <button
        class="border-surface-300 dark:border-surface-600 hover:bg-surface-200 dark:hover:bg-surface-800 rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
        onclick={() => goTo(currentIndex - 1)}
        disabled={currentIndex === 0}
      >
        Previous
      </button>

      <div class="flex gap-2">
        {#each quiz.questions as question, i (question.id)}
          <button class={stepClass(i)} onclick={() => goTo(i)} aria-label="Go to question {i + 1}">
            {i + 1}
          </button>
        {/each}
      </div>

      {#if currentIndex === quiz.questions.length - 1}
        <button
          class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          onclick={() => (submitted = true)}
          disabled={!allAnswered}
        >
          Submit
        </button>
      {:else}
        <button class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm" onclick={() => goTo(currentIndex + 1)}>
          Next
        </button>
      {/if}
    </div>
  </div>
{/if}
