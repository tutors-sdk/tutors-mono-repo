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

<article class="prose dark:prose-invert mr-4 max-w-none overflow-x-auto">
  {#key currentCodeTheme.value}
    {@html sanitizeHtml(proseHtml)}
  {/key}

  {#if quiz}
    <div class="not-prose">
      <QuizTaker {quiz} fallbackTitle={lo.title} />
    </div>
  {:else}
    <div class="border-error-500 bg-surface-100 dark:bg-surface-900 my-4 rounded-xl border p-4">
      <h3 class="m-0 text-lg font-medium">{lo.title}</h3>
      <p class="text-error-500 m-0 mt-1 text-sm">
        {#if content.quizSource === null}
          This quiz has no <code>quiz</code> block. Add one to the markdown file.
        {:else}
          This quiz block has no valid questions. Check that each has
          <code>question</code>, <code>options</code> and an in-range <code>correct</code>.
        {/if}
      </p>
    </div>
  {/if}
</article>
