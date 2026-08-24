<script lang="ts">
  import { browser } from "$app/environment";
  import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_ANON_MODE } from "$env/static/public";
  import type { Whiteboard } from "@tutors/tutors-model-lib";
  import { tutorsId } from "@tutors/runes";
  import { supabase } from "@tutors/community/utils/supabase-client";

  interface Props {
    lo: Whiteboard;
  }
  let { lo }: Props = $props();

  let iframe: HTMLIFrameElement | undefined = $state();
  let loading = $state(true);
  let error = $state("");
  let isFullscreen = $state(false);
  let isEditing = $state(false);
  let isShared = $state(false);
  let cachedScene: any = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function getUserId(): string {
    return tutorsId.value?.login || `anon-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getWhiteboardRoomId(): string {
    const courseId = lo.parentCourse?.courseId || "unknown";
    const route = lo.route.replace(/[^a-zA-Z0-9-]/g, "-");
    if (isShared) {
      return `wb-${courseId}-${route}`;
    }
    return `wb-${courseId}-${route}-${getUserId()}`;
  }

  async function loadSceneFromDb(roomId: string): Promise<any | null> {
    if (PUBLIC_ANON_MODE === "TRUE" || !supabase) return null;
    try {
      const { data } = await supabase
        .from("whiteboard_scenes")
        .select("elements, app_state, files")
        .eq("room_id", roomId)
        .single();
      if (data) {
        return { elements: data.elements, appState: data.app_state, files: data.files };
      }
    } catch {
      // fall through to static file
    }
    return null;
  }

  function saveSceneToDb(roomId: string, elements: any[]) {
    if (PUBLIC_ANON_MODE === "TRUE" || !supabase) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await supabase.from("whiteboard_scenes").upsert({
          room_id: roomId,
          elements,
          app_state: { viewBackgroundColor: "#ffffff" },
          files: {},
          updated_at: new Date().toISOString(),
        });
      } catch {
        // best-effort persistence
      }
    }, 2000);
  }

  async function loadScene() {
    if (!lo.excalidraw) {
      error = "No Excalidraw file associated with this whiteboard.";
      loading = false;
      return;
    }
    try {
      const response = await fetch(lo.excalidraw);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      cachedScene = await response.json();
      setupMessageHandler();
    } catch (e: any) {
      error = e.message || "Failed to load whiteboard";
      loading = false;
    }
  }

  function setupMessageHandler() {
    const handler = async (event: MessageEvent) => {
      if (event.data?.type === "viewer-ready" && !isEditing) {
        window.removeEventListener("message", handler);
        iframe?.contentWindow?.postMessage({ type: "load-scene", scene: cachedScene }, "*");
        loading = false;
      } else if (event.data?.type === "editor-ready" && isEditing) {
        window.removeEventListener("message", handler);
        const roomId = getWhiteboardRoomId();
        const savedScene = await loadSceneFromDb(roomId);
        iframe?.contentWindow?.postMessage({
          type: "init-editor",
          supabaseUrl: PUBLIC_SUPABASE_URL,
          supabaseAnonKey: PUBLIC_SUPABASE_ANON_KEY,
          roomId,
          user: {
            name: tutorsId.value?.name || "Anonymous",
            id: getUserId(),
            avatar: tutorsId.value?.image || "",
          },
          initialScene: savedScene || cachedScene,
        }, "*");
        loading = false;
      } else if (event.data?.type === "scene-changed" && isEditing) {
        saveSceneToDb(getWhiteboardRoomId(), event.data.elements);
      }
    };
    window.addEventListener("message", handler);
  }

  function toggleEdit() {
    isEditing = !isEditing;
    loading = true;
    setupMessageHandler();
  }

  function toggleShared() {
    isShared = !isShared;
    if (isEditing) {
      loading = true;
      setupMessageHandler();
    }
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
  <div class="{isFullscreen ? 'fixed inset-0 z-50 flex flex-col bg-base-100' : ''}">
    <div class="flex items-center gap-2 rounded-t-lg bg-surface-200 px-4 py-2">
      <button
        class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors {isEditing ? 'bg-primary-500 text-white' : 'bg-surface-300 hover:bg-surface-400'}"
        onclick={toggleEdit}
        aria-label={isEditing ? "Switch to view mode" : "Switch to edit mode"}
        title={isEditing ? "View mode" : "Edit mode"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          {#if isEditing}
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>
          {:else}
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>
          {/if}
        </svg>
        {isEditing ? "Editing" : "Edit"}
      </button>
      {#if isEditing}
        <button
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors {isShared ? 'bg-success-500 text-white' : 'bg-surface-300 hover:bg-surface-400'}"
          onclick={toggleShared}
          aria-label={isShared ? "Switch to personal whiteboard" : "Switch to shared whiteboard"}
          title={isShared ? "Shared: all users collaborate" : "Personal: only you can see edits"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            {#if isShared}
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
            {:else}
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            {/if}
          </svg>
          {isShared ? "Shared" : "Personal"}
        </button>
      {/if}
      <div class="flex-1"></div>
      <button
        class="flex items-center gap-1.5 rounded-lg bg-surface-300 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-surface-400"
        onclick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          {#if isFullscreen}
            <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
          {:else}
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
          {/if}
        </svg>
        {isFullscreen ? "Minimize" : "Fullscreen"}
      </button>
    </div>
    {#if loading}
      <div class="flex items-center justify-center" style={isEditing ? 'height: 80vh;' : 'aspect-ratio: 16/9;'}>
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    {/if}
    <iframe
      bind:this={iframe}
      src={isEditing ? "/excalidraw-editor.html" : "/excalidraw-viewer.html"}
      title="Excalidraw Whiteboard"
      class="w-full border-0 {isFullscreen ? 'flex-1' : 'rounded-b-lg'} {loading ? 'hidden' : ''}"
      style={isFullscreen ? '' : isEditing ? 'height: 80vh;' : 'aspect-ratio: 16/9;'}
      sandbox="allow-scripts allow-same-origin"
    ></iframe>
  </div>
{/if}
