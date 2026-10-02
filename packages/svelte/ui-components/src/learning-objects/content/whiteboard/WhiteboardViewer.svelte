<script lang="ts">
  import { browser } from "$app/environment";
  import { env } from "$env/dynamic/public";
  import type { Whiteboard } from "@tutors/tutors-model-lib";
  import { tutorsId } from "@tutors/runes";
  import { dataApi, type WhiteboardRoom } from "@tutors/data-api";
  import log from "@tutors/logger";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { themeService } from "@tutors/themes";

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
  // Raw, not a deep $state proxy: the scene is posted to the iframe, and a proxy cannot be structured-cloned
  // (postMessage throws DataCloneError and the whiteboard never leaves "Loading"). It is only ever replaced whole.
  let cachedScene: any = $state.raw(null);
  let saveStatus = $state("");
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

  function sceneRoom(): WhiteboardRoom {
    return { courseId: lo.parentCourse?.courseId || "unknown", route: lo.route, shared: isShared };
  }

  const canSave = () => env.PUBLIC_ANON_MODE !== "TRUE" && !!tutorsId.value?.login;

  async function loadSceneFromDb(): Promise<any | null> {
    if (env.PUBLIC_ANON_MODE === "TRUE" || (!isShared && !tutorsId.value?.login)) return null;
    const saved = await dataApi.getWhiteboard(sceneRoom());
    return saved?.scene ?? null;
  }

  function saveSceneToDb(elements: any[]) {
    if (!canSave()) { saveStatus = "Sign in to save your edits. Use the export menu to keep a copy."; return; }
    if (saveTimer) clearTimeout(saveTimer);
    saveStatus = "Saving…";
    saveTimer = setTimeout(async () => {
      const response = await dataApi.saveWhiteboard({ ...sceneRoom(), elements });
      saveStatus = response?.ok ? "Drawing changes saved" : "Changes could not be saved. Keep this whiteboard open and export your work.";
    }, 2000);
  }

  // Excalidraw follows the reader's appearance: sent with the scene and the editor setup, and again on change.
  const theme = $derived(themeService.lightMode.value === "dark" ? "dark" : "light");
  $effect(() => {
    const current = theme;
    iframe?.contentWindow?.postMessage({ type: "set-theme", theme: current }, window.location.origin);
  });

  // The iframe is recreated whenever the mode or room changes (see the {#key} below),
  // so each fresh iframe announces itself with viewer-ready / editor-ready.
  let viewerReady = false;

  function postViewerScene() {
    if (!viewerReady || !cachedScene || isEditing) return;
    iframe?.contentWindow?.postMessage({ type: "load-scene", scene: cachedScene, theme }, window.location.origin);
    loading = false;
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
      postViewerScene();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("WhiteboardViewer failed to load scene:", err);
      error = msg || "Failed to load whiteboard";
      loading = false;
    }
  }

  // One listener for the lifetime of the component: scene-changed keeps arriving
  // after editor-ready, so the handler must not remove itself. Only this component's
  // own iframe, on this origin, is listened to, and replies go to this origin only.
  async function handleMessage(event: MessageEvent) {
    if (event.source !== iframe?.contentWindow || event.origin !== window.location.origin) return;
    const type = event.data?.type;
    if (type === "viewer-ready" && !isEditing) {
      viewerReady = true;
      postViewerScene();
    } else if (type === "editor-ready" && isEditing) {
      const roomId = getWhiteboardRoomId();
      const savedScene = await loadSceneFromDb();
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
        theme,
      }, window.location.origin);
      loading = false;
    } else if (type === "scene-changed" && isEditing) {
      saveSceneToDb(event.data.elements);
    }
  }

  function setEditing(editing: boolean) {
    if (editing === isEditing) return;
    isEditing = editing;
    viewerReady = false;
    saveStatus = "";
    loading = true;
  }

  function setShared(shared: boolean) {
    if (shared === isShared) return;
    isShared = shared;
    if (isEditing) loading = true;
  }

  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
  }

  $effect(() => {
    if (!browser) return;
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (saveTimer) clearTimeout(saveTimer);
    };
  });

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
    <div class="whiteboard-toolbar">
      <!-- Exclusive choices are segmented switches, like Light/Dark in Preferences. -->
      <div class="segmented" role="group" aria-label="Whiteboard mode">
        <button aria-pressed={!isEditing} onclick={() => setEditing(false)}><Icon icon="lucide:eye" height="16" />View</button>
        <button aria-pressed={isEditing} onclick={() => setEditing(true)}><Icon icon="lucide:pencil" height="16" />Edit</button>
      </div>
      {#if isEditing}
        <div class="segmented" role="group" aria-label="Whiteboard copy">
          <button aria-pressed={!isShared} onclick={() => setShared(false)}><Icon icon="lucide:user" height="16" />Personal</button>
          <button aria-pressed={isShared} onclick={() => setShared(true)}><Icon icon="lucide:users" height="16" />Shared</button>
        </div>
      {/if}
      <button class="ui-button fullscreen" aria-pressed={isFullscreen} onclick={toggleFullscreen}><Icon icon={isFullscreen ? "lucide:minimize-2" : "lucide:maximize-2"} height="16" />{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</button>
    </div>
    {#if isEditing}<p class="whiteboard-status ui-muted" role="status">{saveStatus || (canSave() ? "Use the whiteboard export menu to keep a copy of your work." : "Sign in to save your edits. Use the export menu to keep a copy.")}</p>{/if}
    <div class="whiteboard-canvas" class:editing={isEditing}>
      {#if loading}<p class="whiteboard-loading ui-muted" role="status">Loading whiteboard…</p>{/if}
      {#if cachedScene}
        {#key `${isEditing}-${isShared}`}
          <iframe bind:this={iframe} src={isEditing ? "/excalidraw-editor.html" : "/excalidraw-viewer.html"} title={lo.title || "Whiteboard"} class:loading sandbox="allow-scripts allow-same-origin"></iframe>
        {/key}
      {/if}
    </div>
  </div>
{/if}
<style>
  .whiteboard { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
  .whiteboard-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
  .segmented { display: flex; gap: 2px; padding: 2px; border: 1px solid var(--ui-border); border-radius: var(--radius-control); background: var(--ui-canvas); }
  .segmented button { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 40px; padding: 0 var(--space-4); border: 1px solid transparent; border-radius: calc(var(--radius-control) - 2px); background: transparent; color: var(--ui-muted); font-size: var(--font-control); font-weight: var(--weight-medium); }
  .segmented button:hover { color: var(--ui-ink); }
  .segmented button[aria-pressed="true"] { border-color: var(--ui-border); background: var(--ui-surface); color: var(--ui-brand); }
  .fullscreen { margin-left: auto; }
  .fullscreen[aria-pressed="true"] { box-shadow: none; }
  .whiteboard-status { font-size: var(--font-label); }
  /* The drawing follows the appearance (Excalidraw's light or dark theme), so its frame does too: white, or
     Excalidraw's dark canvas. The hairline and radius set it into the panel; it keeps its size while loading. */
  .whiteboard-canvas { position: relative; aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid var(--ui-border); border-radius: var(--radius-card); background: light-dark(var(--surface), #121212); }
  .whiteboard-canvas.editing { aspect-ratio: auto; height: 75dvh; }
  .whiteboard-canvas iframe { display: block; width: 100%; height: 100%; border: 0; }
  .whiteboard-canvas iframe.loading { visibility: hidden; }
  .whiteboard-loading { position: absolute; inset: 0; display: grid; place-items: center; font-size: var(--font-label); }
  .expanded { position: fixed; inset: 0; z-index: 9999; border-radius: 0; }
  .expanded .whiteboard-canvas { flex: 1; aspect-ratio: auto; height: auto; }
  @media (max-width: 639px) { .fullscreen { margin-left: 0; } .segmented button, .fullscreen { padding: 0 var(--space-3); } }
</style>
