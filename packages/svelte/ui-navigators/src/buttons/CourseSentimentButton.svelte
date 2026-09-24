<script lang="ts">
  import { Popover, Portal } from "@skeletonlabs/skeleton-svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { tutorsId } from "@tutors/runes";
  import { tutorsConnectService, COURSE_SENTIMENT_IDS, type CourseSentimentId } from "@tutors/connect";
  import log from "@tutors/logger";
  import { t } from "@tutors/i18n";

  let menuOpen = $state(false);
  let selected = $state<CourseSentimentId>("neutral");

  $effect(() => {
    selected = tutorsId.value?.sentiment ?? (typeof localStorage !== "undefined" ? localStorage.sentiment : "neutral");
  });

  async function pick(id: CourseSentimentId) {
    menuOpen = false;
    try {
      await tutorsConnectService.updateSentiment(id);
    } catch (e) {
      log.error(e);
    }
    selected = id;
  }
</script>

<Popover open={menuOpen} onOpenChange={(d) => (menuOpen = d.open)} positioning={{ placement: "bottom-start", gutter: 8 }}>
  <Popover.Trigger
    class="nav-row sentiment-trigger"
    aria-label={`${t("content.sentiment")}: ${selected}. ${t("content.sentimentOpen")}`}
  >
    <Icon icon="lucide:smile" color="var(--ui-brand)" height="20" />
    <span>{t("content.sentiment")}</span>
  </Popover.Trigger>
  <Portal>
    <Popover.Positioner>
      <Popover.Content class="sentiment-menu">
        <Popover.Title class="ui-eyebrow">{t("content.sentiment")}</Popover.Title>
        {#each COURSE_SENTIMENT_IDS as id (id)}
          <button type="button" class="sentiment-option" aria-pressed={selected === id} onclick={() => pick(id)}>
            <Icon type={id} height="24" />
            <span>{id}</span>
            {#if selected === id}<span class="selected-mark" aria-hidden="true">✓</span>{/if}
          </button>
        {/each}
      </Popover.Content>
    </Popover.Positioner>
  </Portal>
</Popover>
<style>
  :global(.sentiment-trigger) { width: 100%; text-align: left; font-weight: var(--weight-regular); }
  :global(.sentiment-menu) { z-index: 10000; width: 18rem; max-width: calc(100vw - 24px); max-height: calc(100dvh - 24px); overflow-y: auto; padding: var(--space-3); background: var(--ui-surface); color: var(--ui-ink); border: 1px solid var(--ui-border); border-radius: var(--radius-panel); box-shadow: 0 12px 32px #0000001a; }
  :global(.sentiment-menu .ui-eyebrow) { padding: var(--space-2) var(--space-3); }
  .sentiment-option { display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: 44px; margin-top: var(--space-1); padding: var(--space-3); border-radius: var(--radius-control); text-align: left; font-size: var(--font-label); text-transform: capitalize; }
  .sentiment-option:hover, .sentiment-option[aria-pressed="true"] { background: var(--ui-selected); }
  .selected-mark { margin-left: auto; color: var(--ui-brand); }
</style>
