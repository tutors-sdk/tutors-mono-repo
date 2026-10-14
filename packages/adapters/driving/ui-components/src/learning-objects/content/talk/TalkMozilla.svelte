<script lang="ts">
  import * as pdfjs from "pdfjs-dist";
  // @ts-ignore
  import FileSaver from "file-saver";
  import { onDestroy, tick } from "svelte";
  import { Progress } from "@skeletonlabs/skeleton-svelte";
  import { PDFWorker, getDocument } from "pdfjs-dist";
  import type { Talk } from "@tutors/tutors-model-lib";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";
  import log from "@tutors/logger";

  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  // pdfjs.GlobalWorkerOptions.workerSrc = "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";

  interface Props {
    lo: Talk;
  }
  let { lo }: Props = $props();

  let pageNum = $state(1);
  let url = "";
  let canvas: any = $state();
  let pdfDoc: any = $state(null);
  let pageRendering = false;
  let pageNumPending: number | null = null;
  let rotation = 0;
  let loading = $state(true);
  let fullscreen = $state(false);
  let loadError = $state("");
  let worker: PDFWorker | undefined;
  let viewer: HTMLElement;

  $effect(() => {
    loading = true;
    url = lo.pdf;
    pageNum = 1;
    loadDoc();
  });

  function keypressInput(e: KeyboardEvent) {
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, button, a")) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onNextPage();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onPrevPage();
    }
  }

  onDestroy(() => { void pdfDoc?.destroy(); });

  async function loadDoc() {
    loading = true; loadError = "";
    try {
      const loadingTask = await getDocument({ url, worker });
      pdfDoc = await loadingTask.promise;
      loading = false;
      await tick();
      await renderPage(pageNum);
    } catch (error) {
      log.error("Error loading document:", error);
      loading = false; loadError = "This presentation could not be loaded.";
    }
  }

  async function renderPage(num: number) {
    pageRendering = true;
    try {
      const page = await pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale: 1.8, rotation: rotation });
      const canvasContext = canvas?.getContext("2d");

      if (canvas && viewport) {
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const renderContext = {
          canvasContext,
          viewport
        };
        const renderTask = page.render(renderContext);
        await renderTask.promise;

      }
    } catch (error) {
      log.error(`Error rendering or getting page ${num}`, error);
      loadError = "This page could not be displayed. Try reloading the presentation.";
    } finally {
      pageRendering = false;
      if (pageNumPending !== null && !loadError) {
        const pending = pageNumPending; pageNumPending = null;
        void renderPage(pending);
      }
    }
  }

  function queueRenderPage(num: number) {
    if (pageRendering) {
      pageNumPending = num;
    } else {
      renderPage(num);
    }
  }

  function onPrevPage() {
    if (pageNum <= 1) {
      return;
    }
    pageNum--;
    queueRenderPage(pageNum);
  }

  function onNextPage() {
    if (!pdfDoc || pageNum >= pdfDoc.numPages) {
      return;
    }
    pageNum++;
    queueRenderPage(pageNum);
  }

  function clockwiseRotate() {
    rotation = rotation + 90;
    queueRenderPage(pageNum);
  }

  function downloadPdf() {
    let fileName = url.substring(url.lastIndexOf("/") + 1);
    FileSaver.saveAs(url, fileName);
  }
</script>

<svelte:document onfullscreenchange={() => fullscreen = document.fullscreenElement === viewer} />

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The focused presentation surface owns arrow-key slide navigation.) -->
<section bind:this={viewer} class="ui-panel media-viewer" aria-label={lo.title} tabindex="0" onkeydown={keypressInput}>
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div class="text-sm">
      {#if pdfDoc}{pageNum} of {pdfDoc.numPages}{/if}
    </div>
    <div class="ui-actions">
      <button class="ui-button" disabled={pageNum <= 1 || loading || !!loadError} onclick={onPrevPage} aria-label={t("content.slideBack")}>
        <Icon type="left" tip={t("content.slideBack")} />
      </button>
      <button class="ui-button" disabled={pageNum >= (pdfDoc?.numPages ?? 0) || loading || !!loadError} onclick={onNextPage} aria-label={t("content.slideForward")}>
        <Icon type="right" tip={t("content.slideForward")} />
      </button>
      <button class="ui-button" disabled={loading || !!loadError} onclick={clockwiseRotate} aria-label={t("content.slideRotate")}>
        <Icon type="rotate" tip={t("content.slideRotate")} />
      </button>
      <button class="ui-button" onclick={downloadPdf} aria-label={t("content.slideDownload")}>
        <Icon type="download" tip={t("content.slideDownload")} />
      </button>
      <button class="ui-button" onclick={() => document.fullscreenElement ? document.exitFullscreen() : viewer.requestFullscreen()} aria-label={fullscreen ? "Exit fullscreen" : t("content.slideFullScreen")}>
        <Icon icon={fullscreen ? "lucide:minimize" : "lucide:maximize"} />
      </button>
    </div>
  </div>
  {#if loadError}
    <div class="ui-empty" role="alert"><p>{loadError}</p><div class="ui-actions mt-4"><button class="ui-button" onclick={loadDoc}>Retry</button><a class="ui-button" href={lo.pdf} target="_blank" rel="noopener noreferrer">Open original</a></div></div>
  {:else if !loading}
    <canvas aria-label={`${lo.title}, page ${pageNum}`} class="mx-auto w-full" bind:this={canvas}></canvas>
  {:else}
    <div class="flex min-h-64 items-center justify-center">
      <Progress value={null} />
    </div>
  {/if}
</section>
