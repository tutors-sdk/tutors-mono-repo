<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { currentCourse, tutorsId } from "@tutors/runes";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { env } from "$env/dynamic/public";

  import { t } from "@tutors/i18n";
  let { labelled = false } = $props();
  let showEditor = $state(false);
  let loading = $state(false);
  let overlayEl: HTMLDialogElement | undefined = $state();
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
      overlayEl.showModal();

      const handler = (event: MessageEvent) => {
        if (event.source !== editorIframe?.contentWindow || event.origin !== window.location.origin) return;
        if (event.data?.type === "editor-ready") {
          window.removeEventListener("message", handler);
          editorIframe?.contentWindow?.postMessage({
            type: "init-editor",
            supabaseUrl: env.PUBLIC_SUPABASE_URL,
            supabaseAnonKey: env.PUBLIC_SUPABASE_ANON_KEY,
            roomId: getWhiteboardRoomId(),
            user: {
              name: tutorsId.value?.name || "Anonymous",
              id: tutorsId.value?.login || "anon",
              avatar: tutorsId.value?.image || "",
            },
            initialScene: null,
          }, window.location.origin);
          loading = false;
        }
      };
      window.addEventListener("message", handler);

      return () => {
        window.removeEventListener("message", handler);

      };
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if currentCourse?.value}
  <button onclick={openEditor} aria-label={t("shell.whiteboard")}>
    <div class="nav-row">
      <Icon type="whiteboard" />
      {#if labelled}<span>{t("shell.whiteboard")}</span>{/if}
    </div>
  </button>
{/if}

{#if showEditor}
  <dialog bind:this={overlayEl} class="course-whiteboard" aria-label="Course whiteboard" onclose={closeEditor}>
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ui-border)] px-4 py-3" style="z-index: 1;">
      <span class="ui-section-title">Course whiteboard · Shared</span>
      <button
        class="ui-button"
        onclick={closeEditor}
        aria-label="Close whiteboard"
      >
        Close
      </button>
    </div>
    <div class="relative flex-1">
      {#if loading}
        <div class="absolute inset-0 flex items-center justify-center">
          <p role="status" class="ui-muted">{t("shell.loading")}</p>
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
  </dialog>
{/if}

<style>
  .course-whiteboard { position: fixed; inset: 0; margin: 0; width: 100vw; max-width: none; height: 100dvh; max-height: none; padding: 0; background: var(--ui-surface); color: var(--ui-ink); }
  .course-whiteboard[open] { display: flex; flex-direction: column; }
</style>
