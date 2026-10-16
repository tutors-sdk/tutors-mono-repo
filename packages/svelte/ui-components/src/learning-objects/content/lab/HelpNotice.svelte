<script lang="ts">
  /**
   * What came back from a help request, on the lab step: the lecturer's typed hint on the step it was
   * asked from (Rule 0397), and once the request is resolved, one question whether the help helped
   * (Rule 0398). Nothing shows to a visitor or in anonymous mode.
   */
  import { helpService } from "@tutors/community/assistance/help";
  import { t } from "@tutors/i18n";

  const hint = $derived(helpService.step.value && helpService.request.value ? helpService.hint() : null);
  const asking = $derived(helpService.step.value && helpService.request.value ? helpService.asksRating() : false);
  // From the service, so a rating kept through Retry thanks the student too.
  const thanked = $derived(helpService.step.value && helpService.request.value ? helpService.thanked() : false);
</script>

{#if helpService.available.value}
  {#if hint}
    <aside class="help-hint ui-panel" role="status" aria-labelledby="help-hint-title">
      <div class="help-head">
        <h2 id="help-hint-title" class="ui-eyebrow">{t("help.hintTitle")}</h2>
        <button type="button" class="ui-button help-small" onclick={() => helpService.closeHint()}>{t("help.closeHint")}</button>
      </div>
      <p class="help-text">{hint}</p>
    </aside>
  {/if}
  {#if asking}
    <aside class="help-rating ui-panel" role="status">
      <span>{t("help.helpedQuestion")}</span>
      <span class="help-actions">
        <button type="button" class="ui-button help-small" disabled={helpService.sending.value} onclick={() => helpService.rate(true)}>{t("help.yes")}</button>
        <button type="button" class="ui-button help-small" disabled={helpService.sending.value} onclick={() => helpService.rate(false)}>{t("help.no")}</button>
        <button type="button" class="ui-button help-small" onclick={() => helpService.dismiss()}>{t("help.notNow")}</button>
      </span>
    </aside>
  {:else if thanked}
    <p class="help-thanks ui-muted" role="status">{t("help.thanks")}</p>
  {/if}
{/if}

<style>
  .help-hint, .help-rating { margin-bottom: var(--space-4); padding: var(--space-3) var(--space-4); border-inline-start: 3px solid var(--ui-brand); }
  .help-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .help-text { margin-top: var(--space-2); white-space: pre-wrap; overflow-wrap: anywhere; }
  .help-rating { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .help-actions { display: inline-flex; gap: var(--space-2); }
  .help-small { min-height: 30px; padding: var(--space-1) var(--space-3); font-size: var(--font-meta); }
  .help-thanks { margin-bottom: var(--space-4); font-size: var(--font-meta); }
</style>
