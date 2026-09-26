<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { afterNavigate } from "$app/navigation";
  import Footer from "./footers/Footer.svelte";
  import MainNavigator from "./MainNavigator.svelte";
  import CourseNavigation from "./CourseNavigation.svelte";
  import { t } from "@tutors/i18n";
  import TourOverlay from "@tutors/ui-primitives/components/TourOverlay.svelte";
  import ToastProvider from "@tutors/ui-primitives/components/ToastProvider.svelte";

  let { children, hideNavigator = false, showConnect = true }: { children: Snippet; hideNavigator?: boolean; showConnect?: boolean } = $props();

  // Phones tuck the header away while the reader scrolls down and bring it back on any scroll up, so the
  // page gets the whole screen (CSS below; only phones move it). Near the top, with a header menu open, or
  // when focus moves into the header, it stays in view.
  let header: HTMLElement | undefined = $state();
  let headerHeight = $state(0);
  let tucked = $state(false);
  let lastTop = 0;
  function onScroll(event: Event) {
    const top = (event.currentTarget as HTMLElement).scrollTop;
    const delta = top - lastTop;
    lastTop = top;
    if (top <= headerHeight || header?.querySelector('[aria-expanded="true"]')) tucked = false;
    else if (delta > 4) tucked = true;
    else if (delta < -4) tucked = false;
  }

  afterNavigate(({ to }) => {
    if (to?.url.hash) return;
    document.querySelector<HTMLElement>(".shell-main")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
</script>

<ToastProvider />
<div class="tutors-shell" class:without-navigation={hideNavigator} style:--header-height={`${headerHeight}px`}>
  <a href="#main-content" class="skip-link">{t("a11y.skipToContent")}</a>
  {#if !hideNavigator}
    <header class="shell-header" class:tucked bind:this={header} bind:offsetHeight={headerHeight} onfocusin={() => (tucked = false)}><MainNavigator {showConnect} /></header>
    <aside class="shell-navigation" aria-label={t("shell.navigation")}><CourseNavigation {showConnect} /></aside>
  {/if}
  <!-- The page and the site footer scroll together, but the footer sits outside main so it is the contentinfo landmark. Rule 0171. -->
  <div class="shell-main" onscroll={onScroll}>
    <main id="main-content" tabindex="-1" data-route={page.url.pathname}>{@render children()}</main>
    {#if !hideNavigator}<footer aria-label={t("a11y.footer")}><Footer /></footer>{/if}
  </div>
</div>
<TourOverlay />

<style>
  .tutors-shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); height: 100dvh; background: var(--ui-canvas); }
  .shell-header { grid-column: 1 / -1; z-index: 30; background: var(--ui-surface); border-bottom: 1px solid var(--ui-border); }
  .shell-navigation { min-height: 0; overflow: hidden; border-right: 1px solid var(--ui-border); background: var(--ui-surface); }
  .shell-main { min-width: 0; overflow-y: auto; scroll-padding-block: var(--space-6); }
  main { min-width: 0; outline: none; }
  footer { margin-top: var(--space-12); border-top: 1px solid var(--ui-border); }
  .without-navigation { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  .skip-link { position: fixed; left: var(--space-4); top: -100px; z-index: 10000; padding: var(--space-3); background: var(--ui-brand); color: var(--ui-on-brand); }
  .skip-link:focus { top: var(--space-4); }
  /* Paper --breakpoint-navigation: 1024px (custom properties cannot be used in media queries). */
  @media (max-width: 1023px) { .tutors-shell { grid-template-columns: minmax(0, 1fr); } .shell-navigation { display: none; } }
  /* Phones: the header floats over the top of the page (which starts below it) so it can slide away without
     the page jumping. Rule 0062. */
  @media (max-width: 767px) {
    .tutors-shell:not(.without-navigation) { position: relative; grid-template-rows: minmax(0, 1fr); }
    .shell-header { position: absolute; inset: 0 0 auto; transition: transform 200ms ease-out; }
    .shell-header.tucked { transform: translateY(-100%); }
    .tutors-shell:not(.without-navigation) .shell-main { padding-top: var(--header-height); scroll-padding-top: calc(var(--header-height) + var(--space-6)); }
  }
  @media (max-width: 767px) and (prefers-reduced-motion: reduce) { .shell-header { transition: none; } }
</style>
