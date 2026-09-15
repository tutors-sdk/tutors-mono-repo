<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { currentCourse, tutorsId } from "@tutors/runes";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from "$env/static/public";

  let showEditor = $state(false);
  let loading = $state(false);
  let overlayEl: HTMLDivElement | undefined = $state();
  let editorIframe: HTMLIFrameElement | undefined = $state();

  function getWhiteboardRoomId(): string {
    const courseId = currentCourse?.value?.courseId || "general";
    return `wb-${courseId}-shared`;
  }

  function openEditor() {
    showEditor = true;
    loading = true;
  }

  function closeEditor() {
    showEditor = false;
    loading = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && showEditor) closeEditor();
  }

  $effect(() => {
    if (showEditor && overlayEl) {
      document.body.appendChild(overlayEl);

      const handler = (event: MessageEvent) => {
        if (event.data?.type === "editor-ready") {
          window.removeEventListener("message", handler);
          editorIframe?.contentWindow?.postMessage({
            type: "init-editor",
            supabaseUrl: PUBLIC_SUPABASE_URL,
            supabaseAnonKey: PUBLIC_SUPABASE_ANON_KEY,
            roomId: getWhiteboardRoomId(),
            user: {
              name: tutorsId.value?.name || "Anonymous",
              id: tutorsId.value?.login || "anon",
              avatar: tutorsId.value?.image || "",
            },
            initialScene: null,
          }, "*");
          loading = false;
        }
      };
      window.addEventListener("message", handler);

      return () => {
        window.removeEventListener("message", handler);
        if (overlayEl?.parentNode === document.body) {
          document.body.removeChild(overlayEl);
        }
      };
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if currentCourse?.value}
  <button onclick={openEditor}>
    <div class="hover:preset-tonal-secondary flex items-center gap-2 rounded-lg p-3 text-sm font-bold">
      <Icon type="whiteboard" tip="Whiteboard" />
    </div>
  </button>
{/if}

{#if showEditor}
  <div bind:this={overlayEl} class="fixed inset-0 z-[9999] flex flex-col bg-white" style="isolation: isolate;">
    <div class="flex items-center justify-between bg-surface-200 px-4 py-3 shadow-md" style="z-index: 1;">
      <span class="text-lg font-semibold">Course Whiteboard</span>
      <button
        class="rounded-lg bg-error-500 px-4 py-2 text-sm font-bold text-white hover:bg-error-600"
        onclick={closeEditor}
        aria-label="Close whiteboard"
      >
        Close
      </button>
    </div>
    <div class="relative flex-1">
      {#if loading}
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      {/if}
      <iframe
        bind:this={editorIframe}
        src="/excalidraw-editor.html"
        title="Course Whiteboard"
        class="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin"
      ></iframe>
    </div>
  </div>
{/if}
