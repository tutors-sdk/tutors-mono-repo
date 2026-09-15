<script lang="ts">
  import { Popover, Portal } from "@skeletonlabs/skeleton-svelte";
  let { menuSelector, menuContent, ariaLabel = "" } = $props();
</script>

<Popover>
  <Popover.Trigger aria-label={ariaLabel || undefined}>{@render menuSelector()}</Popover.Trigger>
  <Portal>
    <Popover.Positioner>
      <Popover.Content class="card z-999 m-4 max-w-[500px] space-y-4" style="background-color: light-dark(var(--color-surface-50), var(--color-surface-900));">
        <Popover.Description>
          <nav class="card-body list-nav card w-56 w-full space-y-2 p-2 shadow-lg" style="background-color: light-dark(rgb(243, 244, 246), rgb(31, 41, 55));">
            {@render menuContent()}
          </nav>
        </Popover.Description>
      </Popover.Content>
    </Popover.Positioner>
  </Portal>
</Popover>
