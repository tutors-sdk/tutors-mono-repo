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

<Popover open={menuOpen} onOpenChange={(d) => (menuOpen = d.open)}>
  <Popover.Trigger
    class="hover:preset-tonal-secondary inline-flex items-center rounded-lg p-2"
    aria-label={`${t("content.sentimentLabel")}: ${selected}. ${t("content.sentimentOpen")}`}
  >
    <Icon type={selected} height="28" />
  </Popover.Trigger>
  <Portal>
    <Popover.Positioner>
      <Popover.Content class="card z-999 m-2 max-w-[min(100vw-1rem,18rem)] shadow-lg" style="background-color: light-dark(var(--color-surface-50), var(--color-surface-900));">
        <Popover.Description>
          <div class="card-body gap-1 p-2">
            <p class="text-surface-600-400 px-2 text-xs font-semibold tracking-wide uppercase"></p>
            {#each COURSE_SENTIMENT_IDS as id (id)}
              <button
                type="button"
                class="hover:preset-tonal-secondary flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left"
                onclick={() => pick(id)}
              >
                <span class="shrink-0"><Icon type={id} height="26" /></span>
                <span class="min-w-0 flex-1 text-sm font-medium">{id}</span>
                {#if selected === id}
                  <span class="text-success-500 shrink-0 text-lg leading-none" aria-hidden="true">✓</span>
                {/if}
              </button>
            {/each}
          </div>
        </Popover.Description>
      </Popover.Content>
    </Popover.Positioner>
  </Portal>
</Popover>
