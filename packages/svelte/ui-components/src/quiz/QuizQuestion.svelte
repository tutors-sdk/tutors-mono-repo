<script lang="ts">
  import { markdownIt } from "@tutors/tutors-model-lib";
  import type { QuestionType } from "@tutors/quiz";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";

  interface Props {
    questionIndex: number; text: string; options: string[]; questionType: QuestionType;
    selectedIndex: number | null; disabled: boolean; showCorrect: boolean;
    correctIndex?: number; onselect?: (index: number) => void;
  }
  let { questionIndex, text, options, questionType, selectedIndex, disabled, showCorrect, correctIndex, onselect }: Props = $props();
  const id = $props.id();
  function inline(md: string) { return sanitizeHtml(markdownIt.renderInline(md)); }
</script>

<fieldset class="space-y-4" {disabled}>
  <legend class="quiz-legend"><span class="ui-muted">{questionIndex + 1}.</span> {@html inline(text)}</legend>
  {#if questionType === 'true-false'}<p class="ui-muted quiz-kind">True / False</p>{/if}
  <div class="grid gap-3">
    {#each options as option, i}
      <label class="quiz-option" class:selected={i === selectedIndex} class:correct={showCorrect && i === correctIndex}>
        <input type="radio" name={id} value={i} checked={i === selectedIndex} onchange={() => onselect?.(i)} />
        <span>{@html inline(option)}</span>
        {#if showCorrect && i === correctIndex}<strong>Correct</strong>
        {:else if showCorrect && i === selectedIndex}<strong>Your answer</strong>{/if}
      </label>
    {/each}
  </div>
</fieldset>

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
</style>
