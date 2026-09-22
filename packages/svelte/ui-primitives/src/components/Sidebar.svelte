<script lang="ts">
  import { Dialog, Portal } from "@skeletonlabs/skeleton-svelte";
  import Icon from "./Icon.svelte";
  import { t } from "@tutors/i18n";

  let { position = "right", presentation = "drawer", width = "w-sm", menuSelector, sidebarContent, ariaLabel = "", title = ariaLabel, eyebrow = "", description = "", open = $bindable(false) } = $props();

  function closeOnNavigation(event: MouseEvent) {
    // Let SvelteKit handle the anchor before removing it from the dialog.
    if ((event.target as Element).closest("a[href]")) setTimeout(() => open = false, 0);
  }
</script>

<Dialog {open} onOpenChange={(details) => open = details.open}>
  <Dialog.Trigger aria-label={ariaLabel || undefined}>{@render menuSelector()}</Dialog.Trigger>
  <!-- Mount nested dialogs only when opened so a parent cannot mark them aria-hidden beforehand. -->
  {#if open}
  <Portal>
    <Dialog.Backdrop class="drawer-backdrop" />
    <Dialog.Positioner class="drawer-positioner" data-position={position} data-presentation={presentation}>
      <Dialog.Content class={`paper-drawer ${width}`} data-position={position} data-presentation={presentation}>
        <header class="drawer-header">
          <div class="drawer-heading">
            {#if eyebrow}<p class="ui-eyebrow">{eyebrow}</p>{/if}
            <Dialog.Title class="drawer-title">{title}</Dialog.Title>
            {#if description}<Dialog.Description class="drawer-description">{description}</Dialog.Description>{/if}
          </div>
          <Dialog.CloseTrigger class="drawer-close" aria-label={t("shell.close")}><Icon icon="lucide:x" height="20" /></Dialog.CloseTrigger>
        </header>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="drawer-body" onclickcapture={closeOnNavigation}>{@render sidebarContent()}</div>
      </Dialog.Content>
    </Dialog.Positioner>
  </Portal>
  {/if}
</Dialog>

<style>
  :global(.drawer-backdrop) { position: fixed; inset: 0; z-index: 9998; background: color-mix(in srgb, var(--ink) 36%, transparent); }
  :global(.drawer-positioner) { position: fixed; inset: 0; z-index: 9999; display: flex; justify-content: flex-end; pointer-events: none; }
  :global(.drawer-positioner[data-position="left"]) { justify-content: flex-start; }
  :global(.paper-drawer) { pointer-events: auto; display: flex; flex-direction: column; height: 100dvh; max-width: 100%; min-width: 0; background: var(--ui-surface); color: var(--ui-ink); border-left: 1px solid var(--ui-border); box-shadow: -12px 0 40px #00000014; outline: none; }
  :global(.paper-drawer[data-position="left"]) { border-left: 0; border-right: 1px solid var(--ui-border); }
  :global(.drawer-positioner[data-presentation="dialog"]) { justify-content: center; align-items: center; padding: var(--space-6); }
  :global(.paper-drawer[data-presentation="dialog"]) { height: auto; max-height: calc(100dvh - 48px); border: 1px solid var(--ui-border); border-radius: var(--radius-panel); overflow: hidden; box-shadow: 0 20px 64px #00000024; }
  .drawer-header { display: flex; align-items: flex-start; gap: var(--space-5); padding: var(--space-8); border-bottom: 1px solid var(--ui-border); flex-shrink: 0; }
  .drawer-heading { flex: 1; min-width: 0; }
  :global(.drawer-title) { font-size: var(--font-heading); line-height: var(--leading-heading); font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
  .ui-eyebrow { margin-bottom: var(--space-3); }
  :global(.drawer-description) { margin-top: var(--space-3); color: var(--ui-muted); font-size: var(--font-label); line-height: var(--leading-ui); }
  :global(.drawer-close) { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 44px; height: 44px; margin-top: -8px; border: 1px solid var(--ui-border); border-radius: var(--radius-control); color: var(--ui-muted); background: var(--ui-surface); }
  :global(.drawer-close:hover) { color: var(--ui-ink); background: var(--ui-selected); }
  .drawer-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--space-8); padding-bottom: max(var(--space-8), env(safe-area-inset-bottom)); }
  :global(.paper-drawer[data-state="open"]) { animation: drawer-enter 150ms ease-out; }
  @keyframes drawer-enter { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
  @media (max-width: 767px) { :global(.drawer-positioner[data-presentation="dialog"]) { padding: 0; } :global(.paper-drawer[data-presentation="dialog"]) { height: 100dvh; max-height: 100dvh; border-radius: 0; border: 0; } :global(.paper-drawer) { width: 100%; } .drawer-header, .drawer-body { padding: var(--space-5); } .drawer-body { padding-bottom: max(var(--space-5), env(safe-area-inset-bottom)); } }
  @media (prefers-reduced-motion: reduce) { :global(.paper-drawer[data-state="open"]) { animation: none; } }
</style>
