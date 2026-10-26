<script lang="ts">
  import type { QuestionType } from "@tutors/quiz";
  import { copyCode, currentCodeTheme } from "@tutors/course/markdown";
  import { isBlockQuizText, quizTextToHtml } from "./quiz-text.ts";

  interface Props {
    questionIndex: number; text: string; options: string[]; questionType: QuestionType;
    selectedIndex: number | null; disabled: boolean; showCorrect: boolean;
    correctIndex?: number; onselect?: (index: number) => void;
  }
  let { questionIndex, text, options, questionType, selectedIndex, disabled, showCorrect, correctIndex, onselect }: Props = $props();
  const id = $props.id();
  // A question with a code block cannot sit in a <legend>, which holds phrasing content only, so it names the fieldset instead.
  let blockStem = $derived(isBlockQuizText(text));
  function render(md: string) { return quizTextToHtml(md, currentCodeTheme.value); }
</script>

{#key currentCodeTheme.value}
<fieldset class="space-y-4" {disabled} use:copyCode aria-labelledby={blockStem ? `${id}-stem` : undefined}>
  {#if blockStem}
    <div id="{id}-stem" class="quiz-legend quiz-block"><span class="ui-muted">{questionIndex + 1}.</span> {@html render(text)}</div>
  {:else}
    <legend class="quiz-legend"><span class="ui-muted">{questionIndex + 1}.</span> {@html render(text)}</legend>
  {/if}
  {#if questionType === 'true-false'}<p class="ui-muted quiz-kind">True / False</p>{/if}
  <div class="grid gap-3">
    {#each options as option, i}
      <label class="quiz-option" class:selected={i === selectedIndex} class:correct={showCorrect && i === correctIndex}>
        <input type="radio" name={id} value={i} checked={i === selectedIndex} onchange={() => onselect?.(i)} />
        <span class:quiz-block={isBlockQuizText(option)}>{@html render(option)}</span>
        {#if showCorrect && i === correctIndex}<strong>Correct</strong>
        {:else if showCorrect && i === selectedIndex}<strong>Your answer</strong>{/if}
      </label>
    {/each}
  </div>
</fieldset>
{/key}

<style>
  .quiz-legend { font-size: var(--font-reading); font-weight: var(--weight-medium); }
  .quiz-kind { font-size: var(--font-label); }
  .quiz-option { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); padding: var(--space-4); min-height: 44px; border: 1px solid var(--ui-control-border); border-radius: var(--radius-control); cursor: pointer; }
  .quiz-option > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .quiz-option.selected { background: var(--ui-selected); border-color: var(--ui-brand); }
  .quiz-option.correct { border-color: var(--ui-brand); }
  .quiz-option strong { font-size: var(--font-small); }
  input { accent-color: var(--ui-brand); width: 18px; height: 18px; }
  fieldset:disabled label { cursor: default; }
  /* Block text renders outside the prose styles, so code blocks get their spacing and scrolling here. */
  .quiz-block :global(p) { margin-block: var(--space-2); }
  .quiz-block > span:first-child + :global(p) { display: inline; }
  .quiz-block :global(pre) { margin-block: var(--space-2); padding: var(--space-3); border-radius: var(--radius-control); overflow-x: auto; font-size: var(--font-small); }
</style>
