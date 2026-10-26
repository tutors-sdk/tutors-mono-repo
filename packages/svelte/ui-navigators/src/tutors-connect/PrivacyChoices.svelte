<script lang="ts">
  import { tutorsConnectService } from "@tutors/connect";
  import { consent } from "@tutors/privacy";
  import { tutorsId } from "@tutors/runes";
  import { t } from "@tutors/i18n";

  let dialog: HTMLDialogElement;
  let analytics = $state(false);
  let presence = $state(false);
  let dismissed = $state(false);

  $effect(() => {
    if (tutorsId.value?.login && !consent.value && !dismissed && !dialog.open) dialog.showModal();
  });

  function save() {
    tutorsConnectService.setConsent({ analytics, presence });
    dialog.close();
  }
</script>

<dialog bind:this={dialog} class="privacy-dialog" aria-labelledby="privacy-title" aria-describedby="privacy-intro" onclose={() => (dismissed = true)}>
  <p class="ui-eyebrow">{t("privacy.eyebrow")}</p>
  <h2 id="privacy-title" class="ui-section-title">{t("privacy.title")}</h2>
  <p id="privacy-intro" class="ui-muted">{t("privacy.intro")}</p>
  <div class="privacy-options">
    <label class="privacy-option">
      <input type="checkbox" bind:checked={analytics} />
      <span><span class="privacy-option-title">{t("privacy.analytics")}</span><span class="ui-muted">{t("privacy.analyticsHelp")}</span></span>
    </label>
    <label class="privacy-option">
      <input type="checkbox" bind:checked={presence} />
      <span><span class="privacy-option-title">{t("menu.sharePresence")}</span><span class="ui-muted">{t("privacy.presenceHelp")}</span></span>
    </label>
  </div>
  <div class="ui-actions">
    <button class="ui-button ui-button-primary" onclick={save}>{t("privacy.save")}</button>
  </div>
</dialog>

<style>
  .privacy-dialog { width: 560px; margin: auto; padding: var(--space-6); border: 1px solid var(--ui-border); border-radius: var(--radius-panel); background: var(--ui-surface); color: var(--ui-ink); box-shadow: 0 20px 64px #00000024; }
  .privacy-dialog[open] { display: flex; flex-direction: column; gap: var(--space-3); animation: privacy-enter 150ms ease-out; }
  .privacy-dialog::backdrop { background: #00000059; }
  .privacy-options { display: flex; flex-direction: column; gap: var(--space-2); margin-block: var(--space-2); }
  .privacy-option { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--ui-border); border-radius: var(--radius-control); }
  .privacy-option:hover { background: var(--ui-selected); }
  .privacy-option:has(:checked) { border-color: var(--ui-brand); }
  .privacy-option input { width: 20px; height: 20px; margin-top: 2px; }
  .privacy-option > span { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--font-label); line-height: 1.5; }
  .privacy-option-title { font-size: var(--font-body); font-weight: var(--weight-medium); }
  .ui-actions { justify-content: flex-end; }
  @keyframes privacy-enter { from { opacity: 0; transform: translateY(8px); } }
  @media (max-width: 767px) { .privacy-dialog { width: 100vw; max-width: none; height: 100dvh; max-height: none; border: 0; border-radius: 0; padding: var(--space-5); } .ui-actions > button { flex: 1; } }
</style>
