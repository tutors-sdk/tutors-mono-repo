<script lang="ts" module>
  let nextId = 0;
</script>

<script lang="ts">
  import { markdownIt } from "@tutors/tutors-model-lib";
  import type { QuestionType } from "@tutors/quiz";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";

  interface Props {
    questionIndex: number;
    text: string;
    options: string[];
    questionType: QuestionType;
    selectedIndex: number | null;
    disabled: boolean;
    showCorrect: boolean;
    correctIndex?: number;
    onselect?: (index: number) => void;
  }

  let { questionIndex, text, options, questionType, selectedIndex, disabled, showCorrect, correctIndex, onselect }: Props = $props();

  const labelId = `quiz-question-${nextId++}`;

  // Questions and options are authored in markdown, so `code` spans, emphasis
  // and links must render. Inline rendering keeps them inside the surrounding
  // layout rather than wrapping each one in its own paragraph.
  function inline(md: string): string {
    return sanitizeHtml(markdownIt.renderInline(md));
  }

  let optionRefs: HTMLButtonElement[] = $state([]);

  /**
   * The options form a single radio group, so the group takes one tab stop and
   * the arrow keys move within it. Focus follows selection, which is the
   * expected behaviour for a radio group and matches how a native one behaves.
   */
  function tabIndexFor(index: number): number {
    if (selectedIndex !== null) return index === selectedIndex ? 0 : -1;
    return index === 0 ? 0 : -1;
  }

  function handleSelect(index: number) {
    if (!disabled && onselect) onselect(index);
  }

  function handleKeydown(event: KeyboardEvent, index: number) {
    if (disabled) return;
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const back = event.key === "ArrowUp" || event.key === "ArrowLeft";
    if (!forward && !back) return;

    event.preventDefault();
    const next = (index + (forward ? 1 : -1) + options.length) % options.length;
    optionRefs[next]?.focus();
    handleSelect(next);
  }

  function optionClass(index: number): string {
    const base = "w-full text-left p-4 rounded-lg border transition-all";
    if (showCorrect && correctIndex !== undefined) {
      if (index === correctIndex) {
        return `${base} border-success-500 bg-success-500/20 text-success-700 dark:text-success-300`;
      }
      if (index === selectedIndex) {
        return `${base} border-error-500 bg-error-500/20 text-error-700 dark:text-error-300`;
      }
      return `${base} border-surface-300 dark:border-surface-600 opacity-50`;
    }
    if (index === selectedIndex) {
      return `${base} border-primary-500 bg-primary-500/20 text-primary-700 dark:text-primary-300`;
    }
    if (disabled) {
      return `${base} border-surface-300 dark:border-surface-600 cursor-not-allowed opacity-50`;
    }
    return `${base} border-surface-300 dark:border-surface-600 hover:border-primary-400 hover:bg-primary-500/10 cursor-pointer`;
  }
</script>

<div class="space-y-4">
  <div class="flex items-start gap-3">
    <span class="bg-primary-500 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white">
      {questionIndex + 1}
    </span>
    <div>
      <p id={labelId} class="text-lg font-medium">{@html inline(text)}</p>
      {#if questionType === "true-false"}
        <span class="text-surface-500 text-xs tracking-wide uppercase">True / False</span>
      {/if}
    </div>
  </div>

  <div class="ml-11 grid gap-2" role="radiogroup" aria-labelledby={labelId}>
    {#each options as option, i (i)}
      <button
        bind:this={optionRefs[i]}
        class={optionClass(i)}
        role="radio"
        aria-checked={i === selectedIndex}
        tabindex={tabIndexFor(i)}
        {disabled}
        onclick={() => handleSelect(i)}
        onkeydown={(event) => handleKeydown(event, i)}
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current text-sm font-medium">
              {String.fromCharCode(65 + i)}
            </span>
            <span>{@html inline(option)}</span>
          </div>
          {#if showCorrect && correctIndex !== undefined}
            {#if i === correctIndex}
              <span class="text-success-500 text-sm font-medium">Correct</span>
            {:else if i === selectedIndex}
              <span class="text-error-500 text-sm font-medium">Your answer</span>
            {/if}
          {/if}
        </div>
      </button>
    {/each}
  </div>
</div>
