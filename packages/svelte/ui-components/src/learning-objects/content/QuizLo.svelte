<script lang="ts">
  import { convertMdToHtml, type Lo } from "@tutors/tutors-model-lib";
  import { currentCodeTheme } from "@tutors/course/markdown";
  import { extractQuizBlock, parseQuizMarkdown } from "@tutors/quiz";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  import QuizTaker from "../../quiz/QuizTaker.svelte";

  interface Props {
    lo: Lo;
  }
  let { lo }: Props = $props();

  let content = $derived(extractQuizBlock(lo.contentMd ?? ""));
  let quiz = $derived(content.quizSource === null ? null : parseQuizMarkdown(content.quizSource));
  let proseHtml = $derived(convertMdToHtml(content.prose, currentCodeTheme.value));
</script>

<div class="reading-panel"><article class="prose dark:prose-invert">
  {#key currentCodeTheme.value}
    {@html sanitizeHtml(proseHtml)}
  {/key}

  {#if quiz}
    <div class="not-prose">
      {#key lo.route}<QuizTaker {quiz} fallbackTitle={lo.title} />{/key}
    </div>
  {:else}
    <div class="quiz-error ui-panel not-prose" role="alert">
      <h3 class="ui-section-title">{lo.title}</h3>
      <p>
        {#if content.quizSource === null}
          This quiz has no <code>quiz</code> block. Add one to the markdown file.
        {:else}
          This quiz block has no valid questions. Check that each has
          <code>question</code>, <code>options</code> and an in-range <code>correct</code>.
        {/if}
      </p>
    </div>
  {/if}
</article></div>
<style>
  .quiz-error { margin-block: var(--space-4); border-color: var(--ui-danger); }
  .quiz-error p { margin-top: var(--space-1); font-size: var(--font-label); color: var(--ui-danger); }
</style>
