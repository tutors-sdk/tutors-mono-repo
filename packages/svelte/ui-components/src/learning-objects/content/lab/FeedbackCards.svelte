<script lang="ts">
  /**
   * What a lecturer addressed to this student at this lab step, under its content (Rule 0403), and
   * on request everything they received in the course, newest first (Rule 0409). Another student's
   * never reaches this browser. Bodies are markdown, rendered and sanitised as lab content is
   * (Rule 0408).
   */
  import { feedbackService } from "@tutors/feedback/service";
  import { convertMdToHtml } from "@tutors/tutors-model-lib";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  import { t } from "@tutors/i18n";

  let { courseId }: { courseId: string } = $props();

  const cards = $derived(feedbackService.available.value ? feedbackService.view.value.personal : []);
  const received = $derived(feedbackService.received.value);
  const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const stepName = (stepId: string) => {
    try {
      return decodeURIComponent(stepId);
    } catch {
      return stepId;
    }
  };
</script>

{#if cards.length}
  <section class="feedback-cards" aria-labelledby="feedback-cards-title">
    <h2 id="feedback-cards-title" class="ui-label">{t("feedback.forYou")}</h2>
    {#each cards as card (card.id)}
      <article class="feedback-card ui-panel">
        <div class="feedback-body prose dark:prose-invert">{@html sanitizeHtml(convertMdToHtml(card.body))}</div>
        <p class="feedback-meta ui-muted">{t("feedback.from")} {card.authorId} · <time datetime={card.createdAt}>{when(card.createdAt)}</time></p>
      </article>
    {/each}
  </section>
{/if}

{#if feedbackService.available.value}
  <details class="feedback-received ui-panel ui-disclosure" ontoggle={(e) => (e.currentTarget as HTMLDetailsElement).open && void feedbackService.readReceived(courseId)}>
    <summary>{t("feedback.received")}</summary>
    {#if received && received.length === 0}
      <p class="ui-muted">{t("feedback.receivedEmpty")}</p>
    {:else if received}
      <ol class="feedback-list">
        {#each received as a (a.id)}
          <li class="feedback-item">
            <p class="feedback-meta ui-muted">
              <a href={`${a.ref.labRoute}/${a.ref.stepId}`}>{stepName(a.ref.stepId)}</a> · {a.audience.kind === "everyone" ? t("feedback.toEveryone") : t("feedback.forYou")} ·
              <time datetime={a.createdAt}>{when(a.createdAt)}</time>
            </p>
            <div class="feedback-body prose dark:prose-invert">{@html sanitizeHtml(convertMdToHtml(a.body))}</div>
          </li>
        {/each}
      </ol>
    {/if}
  </details>
{/if}

<style>
  .feedback-cards {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-6);
  }
  .feedback-card {
    padding: var(--space-3) var(--space-4);
    border-inline-start: 3px solid var(--ui-success);
  }
  .feedback-received {
    margin-top: var(--space-6);
    padding: var(--space-2) var(--space-4);
  }
  .feedback-received summary {
    font-weight: var(--weight-semibold);
  }
  .feedback-list {
    display: grid;
    gap: var(--space-2);
    margin: var(--space-2) 0;
    padding: 0;
    list-style: none;
  }
  .feedback-item {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--ui-border);
    border-radius: 8px;
  }
  .feedback-body {
    margin-top: var(--space-2);
    max-width: none;
    overflow-wrap: anywhere;
  }
  .feedback-meta {
    margin-top: var(--space-2);
    font-size: var(--font-caption);
  }
</style>
