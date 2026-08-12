<script lang="ts">
  import Menu from "@tutors/ui-primitives/components/Menu.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import LanguageSwitcher from "./layout/LanguageSwitcher.svelte";
  import AppearanceSwitcher from "./layout/AppearanceSwitcher.svelte";
  import CardStyleSwitcher from "./layout/CardStyleSwitcher.svelte";
  import ThemeSwitcher from "./layout/ThemeSwitcher.svelte";
  import CodeThemeSwitcher from "./layout/CodeThemeSwitcher.svelte";
  import LayoutSwitcher from "./layout/LayoutSwitcher.svelte";
  import { t } from "@tutors/i18n";
  import { currentCourse } from "@tutors/runes";
  import { tourService } from "@tutors/tour";
</script>

{#snippet menuSelector()}
  <div data-tour="layout" class="flex items-center rounded-lg p-4 hover:preset-tonal-secondary">
    <Icon type="lightMode" tip={t("nav.layout.tip")} />
    <span class="ml-2 hidden text-sm font-bold md:block">{t("nav.layout")}</span>
  </div>
{/snippet}

{#snippet menuContent()}
  <div class="ml-2 font-bold">{t("nav.layout.options")}</div>
  <div class="mt-5">
    <div class="mt-4 mb-1 ml-2">{t("nav.layout.appearance")}</div>
    <AppearanceSwitcher />
    <hr />
    <div class="mt-1 mb-1 ml-2">{t("nav.layout.cardStyle")}</div>
    <CardStyleSwitcher />
    <hr />
    <div class="mt-1 mb-1 ml-2">{t("nav.layout.theme")}</div>
    <ThemeSwitcher />
    <hr />
    <div class="mt-1 mb-1 ml-2">{t("nav.layout.codeStyle")}</div>
    <CodeThemeSwitcher />
    <hr />
    <div class="mt-1 mb-1 ml-2">{t("nav.layout.layout")}</div>
    <LayoutSwitcher />
    <hr />
    <div class="mt-1 mb-1 ml-2">{t("nav.layout.language")}</div>
    <LanguageSwitcher />
    {#if currentCourse.value}
      <hr />
      <div class="mt-1 mb-1 ml-2">{t("tour.menuLabel")}</div>
      <div class="mx-2 mb-2">
        <button
          class="preset-tonal w-full rounded-lg px-3 py-2 text-sm font-medium"
          onclick={() => setTimeout(() => tourService.start(), 150)}
        >
          <Icon type="info" />
          <span class="ml-1">{t("tour.startButton")}</span>
        </button>
      </div>
    {/if}
  </div>
{/snippet}

<Menu {menuSelector} {menuContent} />
