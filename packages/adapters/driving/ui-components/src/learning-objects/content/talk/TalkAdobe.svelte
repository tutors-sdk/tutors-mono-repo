<script lang="ts">
  import { page } from "$app/state";
  import * as env from "$app/env/public";
  import { adobeLoaded, currentCourse } from "@tutors/svelte-state";
  import type { Talk } from "@tutors/tutors-model-lib";
  import { onDestroy, onMount } from "svelte";

  interface Props {
    lo: Talk;
    orientation?: "landscape" | "portrait";
  }
  let { lo, orientation = "landscape" }: Props = $props();

  let embedOption = "SIZED_CONTAINER";
  if (currentCourse.value?.pdfOrientation === "portrait") {
    embedOption = "FULL_WINDOW";
  }

  const viewerConfig = {
    embedMode: embedOption,
    defaultViewMode: "FIT_PAGE", // Options are "FIT_WIDTH" or "FIT_PAGE"
    showThumbnails: true,
    showAnnotationTools: false, // Hide annotation tools
    enableAnnotationAPIs: false, // Disable annotations completely
    showLeftHandPanel: true, // Hide left panel for better focus on the document
    showDownloadPDF: true, // Optionally disable download button
    showPrintPDF: true,
    showFullScreen: true,
    showSinglePage: true,
    showZoomControl: true
  };

  let adobeDCView: any = null;
  let mounted = false;
  // Remounting Adobe's viewer into a container id it had already used (switching to the browser
  // reader and back) left it blank (issue 374), so each mount renders into a container of its own.
  const mountId = $props.id();
  let viewerId = $derived(`adobe-pdf-viewer-${lo.pdf.split('/').pop()?.replace(/[^a-z0-9]/gi, '')}-${mountId}`);

  function loadSDK() {
    if (!adobeLoaded.value) {
      const script = document.createElement("script");
      script.src = "https://acrobatservices.adobe.com/view-sdk/viewer.js";
      document.head.appendChild(script);
      adobeLoaded.value = true;
    }
  }

  function displayPDF() {
    if (!window.AdobeDC) return;

    adobeDCView = new window.AdobeDC.View({
      clientId: env.PUBLIC_PDF_KEY,
      divId: viewerId
    });

    const pdfContent = {
      content: {
        location: {
          url: lo.pdf
        }
      },
      metaData: {
        fileName: lo.title
      }
    };
    adobeDCView.previewFile(pdfContent, viewerConfig);
  }

  // React to lo.pdf changes
  $effect(() => {
    const pdfUrl = lo.pdf;
    if (mounted && window.AdobeDC && pdfUrl) {
      displayPDF();
    }
  });

  function onReady() {
    displayPDF();
    mounted = true;
  }

  onMount(() => {
    loadSDK();
    if (window.AdobeDC) {
      onReady();
    } else {
      document.addEventListener("adobe_dc_view_sdk.ready", onReady, { once: true });
    }
  });

  onDestroy(() => {
    if (typeof document !== "undefined") document.removeEventListener("adobe_dc_view_sdk.ready", onReady);
    adobeDCView = null;
  });
</script>

{#if orientation === "portrait"}
  <div class="ui-panel">
    <div id={viewerId} class="mx-auto h-[85dvh]"></div>
  </div>
{:else if currentCourse?.value?.pdfOrientation === "landscape"}
  <div class="ui-panel relative w-full" style="aspect-ratio: 16/11;">
    <div id={viewerId} class="mx-auto h-full w-full"></div>
  </div>
{:else}
  <div class="ui-panel">
    <div id={viewerId} class="mx-auto h-[85dvh]"></div>
  </div>
{/if}
