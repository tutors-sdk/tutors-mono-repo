<script lang="ts">
  import { onMount } from "svelte";
  import { Progress } from "@skeletonlabs/skeleton-svelte";
  import type { Talk } from "@tutors/tutors-model-lib";
  import { renderMarpSlides, buildMarpMarkdown } from "@tutors/course/markdown";
  import { mermaidify } from "@tutors/course/markdown";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";
  import log from "@tutors/logger";

  interface Props {
    lo: Talk;
  }
  let { lo }: Props = $props();

  let loading = $state(true);
  let fullscreen = $state(false);
  let error = $state("");
  let slideIndex = $state(0);
  let slideElements: string[] = $state([]);
  let marpCss = $state("");
  let viewport: HTMLElement | undefined = $state();

  const totalSlides = $derived(slideElements.length);
  const currentSlideHtml = $derived(slideElements[slideIndex] ?? "");

  onMount(() => {

    loadSlides();
  });


  async function loadSlides() {
    loading = true; error = "";
    try {
      const { html, css } = await renderMarpSlides(buildMarpMarkdown(lo));
      marpCss = css;

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const svgs = doc.querySelectorAll("svg[data-marpit-svg]");
      if (svgs.length > 0) {
        slideElements = Array.from(svgs).map((svg) => svg.outerHTML);
      } else {
        const sections = doc.querySelectorAll("section");
        slideElements = Array.from(sections).map((s) => s.outerHTML);
      }
      loading = false;
    } catch (e) {
      log.error("Error rendering Marp slides:", e);
      error = e instanceof Error ? e.message : "Failed to render slides";
      loading = false;
    }
  }

  function keypressInput(e: KeyboardEvent) {
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, button, a")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      nextSlide();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      prevSlide();
    }
  }

  function prevSlide() {
    if (slideIndex > 0) slideIndex--;
  }

  function nextSlide() {
    if (slideIndex < totalSlides - 1) slideIndex++;
  }

  function toggleFullscreen() {
    if (viewport && document.fullscreenElement !== viewport) {
      viewport.requestFullscreen();
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  }
</script>

<svelte:head>
  {#if marpCss}
    {@html `<style>${marpCss}</style>`}
  {/if}
</svelte:head>

<svelte:document onfullscreenchange={() => fullscreen = document.fullscreenElement === viewport} />

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The focused presentation surface owns arrow-key slide navigation.) -->
<section bind:this={viewport} class="ui-panel media-viewer" aria-label={lo.title} tabindex="0" onkeydown={keypressInput}>
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div class="text-sm">
      {#if totalSlides > 0}
        {slideIndex + 1} of {totalSlides}
      {/if}
    </div>
    <div class="ui-actions">
      <button class="ui-button" disabled={slideIndex === 0 || loading} onclick={prevSlide} aria-label={t("content.slideBack")}>
        <Icon type="left" tip={t("content.slideBack")} />
      </button>
      <button class="ui-button" disabled={slideIndex >= totalSlides - 1 || loading} onclick={nextSlide} aria-label={t("content.slideForward")}>
        <Icon type="right" tip={t("content.slideForward")} />
      </button>
      <button class="ui-button" onclick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : t("content.slideFullScreen")}>
        <Icon icon={fullscreen ? "lucide:minimize" : "lucide:maximize"} />
      </button>
    </div>
  </div>

  {#if loading}
    <div class="flex min-h-64 items-center justify-center">
      <Progress value={null} />
    </div>
  {:else if error}
    <div class="flex items-center justify-center p-8 text-sm text-red-500">
      {error}
      <button class="ui-button" onclick={loadSlides}>Retry</button>
    </div>
  {:else if totalSlides === 0}
    <div class="flex items-center justify-center p-8 text-sm opacity-60">
      No slides found in this presentation.
    </div>
  {:else}
    <div class="marp-viewport not-prose" use:mermaidify={currentSlideHtml}>
      <div class="marp-slides">
        {#key slideIndex}
          {@html currentSlideHtml}
        {/key}
      </div>
    </div>
  {/if}
</section>

<style>
  .marp-viewport {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: white;
    border-radius: 0.25rem;
  }
  .marp-viewport:fullscreen {
    display: flex;
    align-items: center;
    justify-content: center;
    background: black;
  }
  :global(.marp-viewport .marp-slides) {
    width: 100%;
    height: 100%;
  }
  :global(.marp-viewport svg[data-marpit-svg]) {
    width: 100%;
    height: 100%;
    display: block;
  }
  :global(.marp-viewport section) {
    width: 100% !important;
    height: 100% !important;
    padding: 2rem;
    box-sizing: border-box;
  }
</style>
