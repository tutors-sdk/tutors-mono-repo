<script lang="ts">
  /**
   * An educator's feedback on this lab step, shown only when the reader's server says the person
   * signed in teaches the course: post to everyone on the step (a banner here and a toast elsewhere
   * in the course) or to one student, see what was posted here and when, and revoke (Rules 0400,
   * 0406, 0409).
   */
  import { feedbackService } from "@tutors/feedback/service";
  import type { Annotation } from "@tutors/feedback";
  import { convertMdToHtml } from "@tutors/tutors-model-lib";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  import { t } from "@tutors/i18n";

  const history = $derived(feedbackService.available.value ? feedbackService.view.value.history : null);
  const failure = $derived(feedbackService.failure.value);

  let audience = $state<"everyone" | "student">("everyone");
  let learnerId = $state("");
  let body = $state("");

  const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const to = (a: Annotation) => (a.audience.kind === "everyone" ? t("feedback.toEveryone") : `${t("feedback.to")} ${a.audience.learnerId}`);
  const ready = $derived(!!body.trim() && (audience === "everyone" || !!learnerId.trim()));

  async function post() {
    const kept = audience === "everyone" ? await feedbackService.broadcast(body) : await feedbackService.annotate(learnerId, body);
    if (kept) body = "";
  }
</script>

{#if history}
  <details class="feedback-composer ui-panel ui-disclosure">
    <summary>{t("feedback.educatorPanel")} <span class="feedback-count">{history.filter((a) => !a.revokedAt).length}</span></summary>
    <form
      class="feedback-form"
      onsubmit={(e) => {
        e.preventDefault();
        void post();
      }}
    >
      <fieldset class="feedback-audience">
        <legend class="ui-label">{t("feedback.audience")}</legend>
        <label><input type="radio" name="feedback-audience" value="everyone" bind:group={audience} /> {t("feedback.everyone")}</label>
        <label><input type="radio" name="feedback-audience" value="student" bind:group={audience} /> {t("feedback.oneStudent")}</label>
        {#if audience === "student"}
          <label class="feedback-login"
            ><span class="sr-only">{t("feedback.studentLogin")}</span><input
              type="text"
              autocomplete="off"
              placeholder={t("feedback.studentLogin")}
              bind:value={learnerId}
            /></label
          >
        {/if}
      </fieldset>
      <label class="ui-label" for="feedback-body">{t("feedback.body")}</label>
      <textarea id="feedback-body" rows="4" maxlength="4000" bind:value={body}></textarea>
      <div class="feedback-actions">
        {#if failure}<span class="feedback-failure" role="alert"
            >{t(failure === "forbidden" ? "feedback.forbidden" : failure === "not-kept" ? "feedback.notKept" : "feedback.notSent")}</span
          >{/if}
        <button type="submit" class="ui-button ui-button-primary" disabled={!ready || feedbackService.sending.value}>{t("feedback.post")}</button>
      </div>
    </form>

    <h3 class="ui-label">{t("feedback.history")}</h3>
    {#if history.length === 0}
      <p class="ui-muted">{t("feedback.historyEmpty")}</p>
    {:else}
      <ol class="feedback-history">
        {#each history as a (a.id)}
          <li class="feedback-item" data-revoked={!!a.revokedAt}>
            <div class="feedback-item-head">
              <span
                >{to(a)} · <time datetime={a.createdAt}>{when(a.createdAt)}</time>{#if a.revokedAt}
                  · {t("feedback.revoked")} <time datetime={a.revokedAt}>{when(a.revokedAt)}</time>{/if}</span
              >
              {#if !a.revokedAt}<button type="button" class="ui-button feedback-small" disabled={feedbackService.sending.value} onclick={() => feedbackService.revoke(a.id)}
                  >{t("feedback.revoke")}</button
                >{/if}
            </div>
            <div class="feedback-body prose dark:prose-invert">{@html sanitizeHtml(convertMdToHtml(a.body))}</div>
          </li>
        {/each}
      </ol>
    {/if}
  </details>
{/if}

<style>
  .feedback-composer {
    margin-top: var(--space-6);
    padding: var(--space-2) var(--space-4);
  }
  .feedback-composer summary {
    font-weight: var(--weight-semibold);
  }
  .feedback-count {
    display: inline-block;
    min-width: 1.6em;
    padding: 0 var(--space-2);
    border-radius: 999px;
    background: var(--ui-selected);
    font-size: var(--font-meta);
    text-align: center;
  }
  .feedback-form {
    display: grid;
    gap: var(--space-2);
    margin: var(--space-3) 0 var(--space-4);
  }
  .feedback-audience {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    border: 0;
    padding: 0;
  }
  .feedback-composer textarea,
  .feedback-login input {
    width: 100%;
    padding: var(--space-2);
    border: 1px solid var(--ui-control-border);
    border-radius: 6px;
    background: var(--ui-surface);
    color: var(--ui-ink);
  }
  .feedback-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-3);
  }
  .feedback-failure {
    color: var(--ui-danger);
    font-size: var(--font-meta);
  }
  .feedback-history {
    display: grid;
    gap: var(--space-2);
    margin: var(--space-2) 0 var(--space-4);
    padding: 0;
    list-style: none;
  }
  .feedback-item {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--ui-border);
    border-radius: 8px;
  }
  .feedback-item[data-revoked="true"] {
    opacity: 0.7;
  }
  .feedback-item-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: var(--font-meta);
    color: var(--ui-muted);
  }
  .feedback-body {
    margin-top: var(--space-1);
    max-width: none;
    overflow-wrap: anywhere;
  }
  .feedback-small {
    min-height: 30px;
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-meta);
  }
</style>
