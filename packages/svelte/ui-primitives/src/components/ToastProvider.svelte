<script lang="ts">
  import { Toast } from "@skeletonlabs/skeleton-svelte";
  import { goto } from "$app/navigation";
  import { toaster } from "../utils/toaster";
</script>

<Toast.Group {toaster}>
  {#snippet children(toast)}
    <Toast
      {toast}
      class="border-surface-300 dark:border-surface-600 bg-surface-100 dark:bg-surface-900 rounded-xl border-[1px] p-4 shadow-lg"
    >
      <div class="flex items-start gap-3">
        <div class="flex-1">
          <Toast.Title class="text-sm font-bold">{toast.title}</Toast.Title>
          <Toast.Description class="text-surface-500 mt-1 text-sm">{toast.description}</Toast.Description>
        </div>
        <div class="flex items-center gap-2">
          {#if toast.meta?.actionUrl}
            <button
              class="preset-filled-primary-500 rounded-lg px-3 py-1.5 text-xs font-medium"
              onclick={() => {
                toaster.dismiss(toast.id);
                const url = String(toast.meta.actionUrl);
                if (/^https?:\/\//i.test(url)) {
                  window.location.href = url;
                } else {
                  goto(url);
                }
              }}
            >
              {toast.meta.actionLabel ?? "Go"}
            </button>
          {/if}
          <Toast.CloseTrigger class="text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 text-lg leading-none">
            &times;
          </Toast.CloseTrigger>
        </div>
      </div>
    </Toast>
  {/snippet}
</Toast.Group>
