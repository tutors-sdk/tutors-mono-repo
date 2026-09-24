<script lang="ts">
  import { onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import { env } from "$env/dynamic/public";
  import type { Whiteboard } from "@tutors/tutors-model-lib";
  import { tutorsId } from "@tutors/runes";
  import { supabase } from "@tutors/community/utils/supabase-client";
  import log from "@tutors/logger";

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
  let cachedScene: any = $state(null);
  let saveStatus = $state("");
  let messageCleanup: (() => void) | undefined;
  const anonymousId = `anon-${Math.random().toString(36).slice(2, 8)}`;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function getUserId(): string {
    return tutorsId.value?.login || anonymousId;
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
    if (env.PUBLIC_ANON_MODE === "TRUE" || !supabase) return null;
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
    if (env.PUBLIC_ANON_MODE === "TRUE" || !supabase) { saveStatus = "Edits are not saved in this session."; return; }
    if (saveTimer) clearTimeout(saveTimer);
    saveStatus = "Saving…";
    saveTimer = setTimeout(async () => {
      try {
        const { error: saveError } = await supabase.from("whiteboard_scenes").upsert({
          room_id: roomId,
          elements,
          app_state: { viewBackgroundColor: "#ffffff" },
          files: {},
          updated_at: new Date().toISOString(),
        });
        if (saveError) throw saveError;
        saveStatus = "Drawing changes saved";
      } catch {
        saveStatus = "Changes could not be saved. Keep this whiteboard open and export your work.";
      }
    }, 2000);
  }

  async function loadScene() {
    error = ""; loading = true; cachedScene = null;
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("WhiteboardViewer failed to load scene:", err);
      error = msg || "Failed to load whiteboard";
      loading = false;
    }
  }

  function setupMessageHandler() {
    messageCleanup?.();
    const handler = async (event: MessageEvent) => {
      if (event.source !== iframe?.contentWindow || event.origin !== window.location.origin) return;
      if (event.data?.type === "viewer-ready" && !isEditing) {
        iframe?.contentWindow?.postMessage({ type: "load-scene", scene: cachedScene }, window.location.origin);
        loading = false;
      } else if (event.data?.type === "editor-ready" && isEditing) {
        const roomId = getWhiteboardRoomId();
        const savedScene = await loadSceneFromDb(roomId);
        iframe?.contentWindow?.postMessage({
          type: "init-editor",
          supabaseUrl: env.PUBLIC_SUPABASE_URL,
          supabaseAnonKey: env.PUBLIC_SUPABASE_ANON_KEY,
          roomId,
          user: {
            name: tutorsId.value?.name || "Anonymous",
            id: getUserId(),
            avatar: tutorsId.value?.image || "",
          },
          initialScene: savedScene || cachedScene,
        }, window.location.origin);
        loading = false;
      } else if (event.data?.type === "scene-changed" && isEditing) {
        saveSceneToDb(getWhiteboardRoomId(), event.data.elements);
      }
    };
    window.addEventListener("message", handler);
    messageCleanup = () => window.removeEventListener("message", handler);
  }

  onDestroy(() => { messageCleanup?.(); });

  function toggleEdit() {
    isEditing = !isEditing;
    saveStatus = "";
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

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') isFullscreen = false; }} />
{#if error}
  <div class="ui-empty" role="alert"><p>{error}</p><button class="ui-button mt-4" onclick={loadScene}>Retry</button></div>
{:else}
  <div class="ui-panel whiteboard" class:expanded={isFullscreen}>
    <div class="ui-actions mb-4">
      <button class="ui-button" class:ui-button-primary={isEditing} onclick={toggleEdit} aria-pressed={isEditing}>{isEditing ? "View whiteboard" : "Edit whiteboard"}</button>
      {#if isEditing}<button class="ui-button" onclick={toggleShared} aria-pressed={isShared}>{isShared ? "Shared · switch to personal" : "Personal · switch to shared"}</button>{/if}
      <button class="ui-button ml-auto" onclick={toggleFullscreen}>{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</button>
    </div>
    {#if isEditing}<p class="ui-muted mb-3 text-sm" role="status">{saveStatus || (env.PUBLIC_ANON_MODE === "TRUE" || !supabase ? "Edits are not saved in this session." : "Use the whiteboard export menu to keep a copy of your work.")}</p>{/if}
    {#if loading}<p class="ui-muted p-8" role="status">Loading whiteboard…</p>{/if}
    {#if cachedScene}
      {#key `${isEditing}-${isShared}`}
        <iframe bind:this={iframe} src={isEditing ? "/excalidraw-editor.html" : "/excalidraw-viewer.html"} title={lo.title || "Whiteboard"} class="w-full border-0" class:hidden={loading} style={isEditing || isFullscreen ? 'height: 75dvh;' : 'aspect-ratio: 16/9;'} sandbox="allow-scripts allow-same-origin"></iframe>
      {/key}
    {/if}
  </div>
{/if}
<style>
  .whiteboard { min-width: 0; }
  .expanded { position: fixed; inset: 0; z-index: 9999; border-radius: 0; overflow: auto; }
</style>
