<script lang="ts">
  import { Toast } from "@skeletonlabs/skeleton-svelte";
  import { goto } from "$app/navigation";
  import { toaster } from "../utils/toaster";
</script>

<Toast.Group {toaster}>
  {#snippet children(toast)}
    <Toast
      {toast}
      class="ui-panel shadow-lg"
    >
      <div class="flex items-start gap-3">
        <div class="flex-1">
          <Toast.Title class="text-sm font-bold">{toast.title}</Toast.Title>
          <Toast.Description class="text-surface-500 mt-1 text-sm">{toast.description}</Toast.Description>
        </div>
        <div class="flex items-center gap-2">
          {#if toast.meta?.actionUrl}
            <button
              class="ui-button ui-button-primary"
              onclick={() => {
                toaster.dismiss(toast.id);
                goto(toast.meta.actionUrl);
              }}
            >
              {toast.meta.actionLabel ?? "Go"}
            </button>
          {/if}
          <Toast.CloseTrigger aria-label="Close notification" class="text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 text-lg leading-none">
            &times;
          </Toast.CloseTrigger>
        </div>
      </div>
    </Toast>
  {/snippet}
</Toast.Group>
