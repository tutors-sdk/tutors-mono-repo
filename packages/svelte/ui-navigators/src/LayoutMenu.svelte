<script lang="ts">
  import Menu from "@tutors/ui-primitives/components/Menu.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import LanguageSwitcher from "./layout/LanguageSwitcher.svelte";
  import AppearanceSwitcher from "./layout/AppearanceSwitcher.svelte";
  import ThemeSwitcher from "./layout/ThemeSwitcher.svelte";
  import CodeThemeSwitcher from "./layout/CodeThemeSwitcher.svelte";
  import LayoutSwitcher from "./layout/LayoutSwitcher.svelte";
  import { t } from "@tutors/i18n";
  import { currentCourse } from "@tutors/runes";
  import { tourService } from "@tutors/tour";
  let open = $state(false);
</script>

{#snippet menuSelector()}
  <span data-tour="layout" class="header-action">
    <Icon icon="lucide:sliders-horizontal" height="20" />
    <span class="hidden md:block">{t("shell.preferences")}</span>
  </span>
{/snippet}

{#snippet menuContent()}
  <div class="preferences-menu">
    <h2>{t("shell.preferences")}</h2>
    <section aria-label={t("shell.appearanceReading")}>
      <AppearanceSwitcher />
      <div class="preference-field"><span>{t("nav.layout.theme")}</span><div class="preference-control"><ThemeSwitcher /></div></div>
      <div class="preference-field"><span>{t("nav.layout.codeStyle")}</span><div class="preference-control"><CodeThemeSwitcher /></div></div>
    </section>
    <section aria-label={t("shell.contentLanguage")}>
      <div class="preference-field"><span>{t("nav.layout.layout")}</span><div class="preference-control"><LayoutSwitcher /></div></div>
      <div class="preference-field"><span>{t("nav.layout.language")}</span><div class="preference-control"><LanguageSwitcher /></div></div>
    </section>
    {#if currentCourse.value}<button class="tour-button" onclick={() => { open = false; setTimeout(() => tourService.start(), 150); }}>{t("tour.startButton")}<span aria-hidden="true">→</span></button>{/if}
  </div>
{/snippet}
<Menu bind:open {menuSelector} {menuContent} ariaLabel={t("nav.layout.tip")} title={t("shell.preferences")} width="22rem" />
<style>
  h2 { font-size: var(--font-body); font-weight: var(--weight-semibold); padding: var(--space-1) var(--space-1) var(--space-4); }
  section + section { border-top: 1px solid var(--ui-border); margin-top: var(--space-4); padding-top: var(--space-4); }
  .preference-field { display: grid; grid-template-columns: 88px minmax(0, 1fr); align-items: center; gap: var(--space-3); margin-top: var(--space-3); }
  section > .preference-field:first-child { margin-top: 0; }
  .preference-field > span { font-size: var(--font-label); color: var(--ui-muted); }
  .preferences-menu :global(select) { appearance: none; width: 100%; min-height: 44px; padding: var(--space-2) var(--space-10) var(--space-2) var(--space-4); border: 1px solid var(--ui-border); box-shadow: none; background-image: none; border-radius: var(--radius-control); background-color: var(--ui-surface); color: var(--ui-ink); font-size: var(--font-label); }
  .preference-control::after { content: ""; position: absolute; right: var(--space-4); top: 50%; width: 8px; height: 8px; border-right: 2px solid var(--ui-muted); border-bottom: 2px solid var(--ui-muted); transform: translateY(-75%) rotate(45deg); pointer-events: none; }
  .preference-control { position: relative; min-width: 0; }
  :global([data-theme="dyslexia"]) .preference-field { grid-template-columns: 1fr; gap: var(--space-1); }
  .tour-button { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; margin-top: var(--space-4); padding: var(--space-3); border-radius: var(--radius-control); background: var(--ui-canvas); color: var(--ui-brand); font-size: var(--font-label); font-weight: var(--weight-medium); }
  .tour-button:hover { background: var(--ui-selected); }
  @media (max-width: 359px) { .preference-field { grid-template-columns: 76px minmax(0, 1fr); gap: var(--space-2); } }
</style>
