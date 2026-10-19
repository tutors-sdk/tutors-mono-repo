<script lang="ts">
  /**
   * A lecturer's explanations for everyone on this lab step, above its content (Rules 0403, 0404):
   * read when the step opens and every minute while it stays visible, never over a realtime channel.
   * Hiding one hides it for this session; it stays in the student's received feedback. Bodies are
   * markdown, rendered and sanitised as lab content is (Rule 0408). Nothing shows to a visitor.
   */
  import { onDestroy, untrack } from "svelte";
  import { stepRef } from "@tutors/feedback";
  import { feedbackService } from "@tutors/feedback/service";
  import { tutorsId } from "@tutors/runes";
  import { convertMdToHtml } from "@tutors/tutors-model-lib";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  import { t } from "@tutors/i18n";

  let { courseId, labRoute, stepId }: { courseId: string; labRoute: string; stepId: string } = $props();

  const ref = $derived(stepRef(courseId, labRoute, stepId));
  const login = $derived(tutorsId.value?.login || null);

  // Only the step and sign-in drive this effect: arrive() reads and writes the service's runes.
  $effect(() => {
    const at = ref;
    const who = login;
    if (at) untrack(() => void feedbackService.arrive(at, who));
  });

  onDestroy(() => feedbackService.leave());

  const banners = $derived(feedbackService.available.value ? feedbackService.banners() : []);
  const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
</script>

{#each banners as banner (banner.id)}
  <aside class="feedback-banner ui-panel" role="status" aria-labelledby="banner-{banner.id}">
    <div class="feedback-head">
      <h2 id="banner-{banner.id}" class="ui-eyebrow">{t("feedback.banner")}</h2>
      <button type="button" class="ui-button feedback-small" onclick={() => feedbackService.dismiss(banner.id)}>{t("feedback.dismiss")}</button>
    </div>
    <div class="feedback-body prose dark:prose-invert">{@html sanitizeHtml(convertMdToHtml(banner.body))}</div>
    <p class="feedback-meta ui-muted">{t("feedback.from")} {banner.authorId} · <time datetime={banner.createdAt}>{when(banner.createdAt)}</time></p>
  </aside>
{/each}

<style>
  .feedback-banner {
    margin-bottom: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-inline-start: 3px solid var(--ui-brand);
    background: var(--ui-selected);
  }
  .feedback-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
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
  .feedback-small {
    min-height: 30px;
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-meta);
  }
</style>
