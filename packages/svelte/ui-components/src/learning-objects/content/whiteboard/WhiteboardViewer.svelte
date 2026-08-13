<script lang="ts">
  import { browser } from "$app/environment";
  import type { Whiteboard } from "@tutors/tutors-model-lib";

  interface Props {
    lo: Whiteboard;
  }
  let { lo }: Props = $props();

  let iframe: HTMLIFrameElement | undefined = $state();
  let loading = $state(true);
  let error = $state("");
  let isFullscreen = $state(false);

  async function loadScene() {
    if (!lo.excalidraw) {
      error = "No Excalidraw file associated with this whiteboard.";
      loading = false;
      return;
    }
    try {
      const response = await fetch(lo.excalidraw);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      const scene = await response.json();
      waitForViewer(scene);
    } catch (e: any) {
      error = e.message || "Failed to load whiteboard";
      loading = false;
    }
  }

  function waitForViewer(scene: any) {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "viewer-ready") {
        window.removeEventListener("message", handler);
        iframe?.contentWindow?.postMessage({ type: "load-scene", scene }, "*");
        loading = false;
      }
    };
    window.addEventListener("message", handler);
  }

  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
  }

  $effect(() => {
    if (browser && lo.excalidraw) {
      loadScene();
    }
  });
</script>

{#if error}
  <div class="flex items-center justify-center rounded-lg bg-error/10 p-8">
    <p class="text-error">{error}</p>
  </div>
{:else}
  <div class="relative {isFullscreen ? 'fixed inset-0 z-50 bg-base-100' : ''}">
    <button
      class="absolute right-2 top-2 z-10 btn btn-sm btn-ghost"
      onclick={toggleFullscreen}
      aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
    >
      {#if isFullscreen}
        <iconify-icon icon="fluent:arrow-minimize-24-filled" width="20"></iconify-icon>
      {:else}
        <iconify-icon icon="fluent:arrow-expand-24-filled" width="20"></iconify-icon>
      {/if}
    </button>
    {#if loading}
      <div class="flex items-center justify-center" style="aspect-ratio: 16/9;">
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    {/if}
    <iframe
      bind:this={iframe}
      src="/excalidraw-viewer.html"
      title="Excalidraw Whiteboard"
      class="w-full border-0 rounded-lg {loading ? 'hidden' : ''}"
      style="aspect-ratio: 16/9;"
      sandbox="allow-scripts allow-same-origin"
    ></iframe>
  </div>
{/if}
