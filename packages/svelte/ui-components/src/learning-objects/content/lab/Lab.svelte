<script lang="ts">
  import type { LiveLab } from "@tutors/course/course";
  import { currentCodeTheme, mermaidify, copyCode } from "@tutors/course/markdown";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  import { t } from "@tutors/i18n";
  let { lab }: { lab: LiveLab } = $props();
  const previous = $derived(lab.prevStep());
  const next = $derived(lab.nextStep());
</script>
<svelte:head><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.18.1/dist/katex.min.css" /></svelte:head>
<div class="lab-content">
  <details class="mobile-steps ui-panel">
    <summary>{t("shell.steps")} · {lab.index + 1} / {lab.steps.length}</summary>
    <nav aria-label={t("shell.steps")}><ul>{@html sanitizeHtml(lab.navbarHtml ?? "")}</ul></nav>
  </details>
  <div class="reading-panel">
    <div class="reading-meta"><span class="ui-eyebrow">{lab.lab.title}</span><span>{t("shell.steps")} {lab.index + 1} / {lab.steps.length}</span></div>
    <article class="prose dark:prose-invert prose-pre:overflow-x-auto" use:mermaidify={lab.content} use:copyCode>
      {#key currentCodeTheme.value}<div id="lab-panel">{@html sanitizeHtml(lab.content ?? "")}</div>{/key}
    </article>
    <nav class="step-pager" aria-label={t("shell.steps")}>
      {#if previous}<a class="ui-button" href={`${lab.url}/${previous}`}>← {t("shell.previous")}<span>{lab.chaptersTitles.get(decodeURI(previous))}</span></a>{/if}
      {#if next}<a class="ui-button ui-button-primary next" href={`${lab.url}/${next}`}>{t("shell.next")} →<span>{lab.chaptersTitles.get(decodeURI(next))}</span></a>{/if}
    </nav>
  </div>
</div>
<style>
  .reading-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-3); font-size: var(--font-meta); color: var(--ui-muted); margin-bottom: var(--space-6); }
  .step-pager { display: flex; justify-content: space-between; gap: var(--space-4); border-top: 1px solid var(--ui-border); margin-top: var(--space-8); padding-top: var(--space-6); }
  .step-pager a { max-width: 48%; flex-wrap: wrap; text-align: left; }
  .step-pager span { width: 100%; font-size: var(--font-caption); overflow-wrap: anywhere; }
  .next { margin-left: auto; }
  .mobile-steps { display: none; margin-bottom: var(--space-4); padding: var(--space-3); }
  @media (max-width: 1023px) { .mobile-steps { display: block; } }
</style>
