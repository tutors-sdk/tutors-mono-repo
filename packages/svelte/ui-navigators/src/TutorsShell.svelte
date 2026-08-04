<script lang="ts">
  import Footer from "./footers/Footer.svelte";
  import { onMount, type Snippet } from "svelte";
  import MainNavigator from "./MainNavigator.svelte";
  import { animationDelay } from "@tutors/runes";
  import { cubicIn, cubicOut } from "svelte/easing";
  import { fly, slide } from "svelte/transition";
  import { prefersReducedMotion } from "@tutors/a11y";
  import { t } from "@tutors/i18n";

  type Props = { children: Snippet; hideNavigator?: boolean; showConnect?: boolean };
  let { children, hideNavigator = false, showConnect = true }: Props = $props();
  let showFooter = $state(false);

  onMount(() => {
    showFooter = true;
  });
</script>

<div class="flex h-screen flex-col">
  <a href="#main-content" class="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:p-4 focus:bg-primary-500 focus:text-white">
    {t("a11y.skipToContent")}
  </a>
  <header class="sticky top-0 z-10" style="background-color: light-dark(var(--color-surface-100), var(--color-surface-950));">
    {#if !hideNavigator}
      <div
        class="w-full"
        in:fly={{ y: -48, duration: prefersReducedMotion.value ? 0 : animationDelay.value * 2, easing: cubicOut }}
        out:fly={{ y: -48, duration: prefersReducedMotion.value ? 0 : animationDelay.value * 2, easing: cubicIn }}
      >
        <MainNavigator {showConnect} />
      </div>
    {/if}
  </header>

  <main id="main-content" tabindex="-1" class="flex-1 overflow-y-auto outline-none">
    {@render children()}
  </main>

  {#if showFooter && !hideNavigator}
    <footer transition:slide={{ duration: prefersReducedMotion.value ? 0 : 800 }} class="mt-auto hidden [@media(min-height:800px)]:lg:block" aria-label={t("a11y.footer")}>
      <Footer />
    </footer>
  {/if}
</div>

<style>
</style>
