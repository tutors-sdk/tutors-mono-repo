<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import Footer from "./footers/Footer.svelte";
  import MainNavigator from "./MainNavigator.svelte";
  import CourseNavigation from "./CourseNavigation.svelte";
  import { t } from "@tutors/i18n";
  import TourOverlay from "@tutors/ui-primitives/components/TourOverlay.svelte";
  import ToastProvider from "@tutors/ui-primitives/components/ToastProvider.svelte";

  let { children, hideNavigator = false, showConnect = true }: { children: Snippet; hideNavigator?: boolean; showConnect?: boolean } = $props();
</script>

<ToastProvider />
<div class="tutors-shell" class:without-navigation={hideNavigator}>
  <a href="#main-content" class="skip-link">{t("a11y.skipToContent")}</a>
  {#if !hideNavigator}
    <header class="shell-header"><MainNavigator {showConnect} /></header>
    <aside class="shell-navigation" aria-label={t("shell.navigation")}><CourseNavigation {showConnect} /></aside>
  {/if}
  <main id="main-content" tabindex="-1" class="shell-main" data-route={page.url.pathname}>
    {@render children()}
    {#if !hideNavigator}<footer aria-label={t("a11y.footer")}><Footer /></footer>{/if}
  </main>
</div>
<TourOverlay />

<style>
  .tutors-shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); height: 100dvh; background: var(--ui-canvas); }
  .shell-header { grid-column: 1 / -1; z-index: 30; background: var(--ui-surface); border-bottom: 1px solid var(--ui-border); }
  .shell-navigation { min-height: 0; overflow: hidden; border-right: 1px solid var(--ui-border); background: var(--ui-surface); }
  .shell-main { min-width: 0; overflow-y: auto; outline: none; scroll-padding-block: var(--space-6); }
  footer { margin-top: var(--space-12); border-top: 1px solid var(--ui-border); }
  .without-navigation { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  .skip-link { position: fixed; left: var(--space-4); top: -100px; z-index: 10000; padding: var(--space-3); background: var(--ui-brand); color: var(--ui-on-brand); }
  .skip-link:focus { top: var(--space-4); }
  /* Paper --breakpoint-navigation: 1024px (custom properties cannot be used in media queries). */
  @media (max-width: 1023px) { .tutors-shell { grid-template-columns: minmax(0, 1fr); } .shell-navigation { display: none; } }
</style>
