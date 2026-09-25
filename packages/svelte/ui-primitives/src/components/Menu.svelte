<script lang="ts">
  import { Popover, Portal } from "@skeletonlabs/skeleton-svelte";
  let { menuSelector, menuContent, ariaLabel = "", title = ariaLabel, width = "18rem", open = $bindable(false) } = $props();
</script>

<Popover {open} onOpenChange={(details) => open = details.open} positioning={{ placement: "bottom-end", gutter: 1 }}>
  <Popover.Trigger class="paper-menu-trigger" aria-label={ariaLabel || undefined}>{@render menuSelector()}</Popover.Trigger>
  <Portal>
    <Popover.Positioner class="paper-popover-positioner">
      <Popover.Content class="paper-popover" style={`width: ${width}`}>
        <Popover.Title class="sr-only">{title}</Popover.Title>
        {@render menuContent()}
      </Popover.Content>
    </Popover.Positioner>
  </Portal>
</Popover>
<style>
  :global(.paper-menu-trigger) { display: flex; align-items: center; justify-content: center; align-self: stretch; border-radius: 0; }
  :global(.paper-menu-trigger[data-state="open"]) { box-shadow: inset 0 -2px var(--ui-brand); }
  :global(.paper-popover) { z-index: 10000; max-width: calc(100vw - 24px); max-height: min(680px, calc(100dvh - 100px)); overflow-y: auto; overscroll-behavior: contain; padding: var(--space-4); border: 1px solid var(--ui-border); border-radius: 0 0 var(--radius-panel) var(--radius-panel); border-top: 0; background: var(--ui-surface); color: var(--ui-ink); box-shadow: 0 12px 32px #0000001a; outline: none; }
  :global(.paper-popover .option > :is(button, a)), :global(.paper-popover .menu-row) { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); width: 100%; min-height: 44px; padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); font-size: var(--font-label); color: var(--ui-ink); text-decoration: none; }
  :global(.paper-popover .option > :is(button, a):hover), :global(.paper-popover .menu-row:hover) { background: var(--ui-selected); }
  :global(.paper-popover .menu-name) { margin-bottom: var(--space-3); padding-inline: var(--space-3); font-size: var(--font-label); font-weight: var(--weight-semibold); }
  :global(.paper-popover[data-state="open"]) { animation: popover-enter 150ms ease-out; }
  @keyframes popover-enter { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { :global(.paper-popover[data-state="open"]) { animation: none; } }
</style>
