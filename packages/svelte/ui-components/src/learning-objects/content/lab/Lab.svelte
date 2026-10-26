<script lang="ts">
  import { goto } from "$app/navigation";
  import type { LiveLab } from "@tutors/course/course";
  import { currentCodeTheme, mermaidify, copyCode } from "@tutors/course/markdown";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  import { t } from "@tutors/i18n";
  import WidthToggle from "../WidthToggle.svelte";
  let { lab }: { lab: LiveLab } = $props();
  const previous = $derived(lab.prevStep());
  const next = $derived(lab.nextStep());

  function navigateStep(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest("input, textarea, select, button, a, summary, [role='dialog']"))) return;
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? next
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? previous : "";
    if (step) {
      event.preventDefault();
      void goto(`${lab.url}/${step}`);
    }
  }
</script>
<svelte:window onkeydown={navigateStep} />
<svelte:head><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.18.1/dist/katex.min.css" /></svelte:head>
<div class="lab-content">
  <details class="mobile-steps ui-panel ui-disclosure">
    <summary>{t("shell.steps")} · {lab.index + 1} / {lab.steps.length}</summary>
    <nav aria-label={t("shell.steps")}><ul>{@html sanitizeHtml(lab.navbarHtml ?? "")}</ul></nav>
  </details>
  <div class="reading-panel">
    <div class="reading-meta"><span class="ui-eyebrow">{lab.lab.title}</span><span class="reading-tools">{t("shell.steps")} {lab.index + 1} / {lab.steps.length}<WidthToggle /></span></div>
    <article class="prose dark:prose-invert prose-pre:overflow-x-auto" use:mermaidify={lab.content} use:copyCode>
      {#key currentCodeTheme.value}<div id="lab-panel">{@html sanitizeHtml(lab.content ?? "")}</div>{/key}
    </article>
    <nav class="step-pager" aria-label={t("shell.stepPager")}>
      {#if previous}<a class="ui-button" href={`${lab.url}/${previous}`}>← {t("shell.previous")}<span>{lab.chaptersTitles.get(decodeURI(previous))}</span></a>{/if}
      {#if next}<a class="ui-button ui-button-primary next" href={`${lab.url}/${next}`}>{t("shell.next")} →<span>{lab.chaptersTitles.get(decodeURI(next))}</span></a>{/if}
    </nav>
  </div>
</div>
<style>
  .reading-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-3); font-size: var(--font-meta); color: var(--ui-muted); margin-bottom: var(--space-6); }
  .reading-tools { display: flex; align-items: center; gap: var(--space-3); }
  .step-pager { display: flex; justify-content: space-between; gap: var(--space-4); border-top: 1px solid var(--ui-border); margin-top: var(--space-8); padding-top: var(--space-6); }
  /* Each pager button is the direction over the step's title: previous reads from the left, next from the right. */
  .step-pager a { flex-direction: column; align-items: flex-start; gap: 2px; max-width: 48%; text-align: start; }
  .step-pager span { font-size: var(--font-caption); font-weight: var(--weight-regular); opacity: 0.85; overflow-wrap: anywhere; }
  .step-pager .next { margin-left: auto; align-items: flex-end; text-align: end; }
  .mobile-steps { display: none; margin-bottom: var(--space-4); padding: var(--space-1) var(--space-4); }
  .mobile-steps summary { font-weight: var(--weight-semibold); }
  .mobile-steps nav { padding-bottom: var(--space-3); }
  @media (max-width: 1023px) { .mobile-steps { display: block; } }
</style>
