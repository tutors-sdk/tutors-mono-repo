<script lang="ts">
  import { convertMdToHtml } from "@tutors/tutors-model-lib";
  import { onMount } from "svelte";
  import { t } from "@tutors/i18n";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  let contentHtml = "";

  onMount(async () => {
    contentHtml = convertMdToHtml(t("footer.message"));
  });
</script>

{#if contentHtml}
  <div class="flex w-full items-center justify-center">
    <p class="prose prose-sm prose-slate dark:prose-invert [&>*]:m-0 min-w-full text-xs">
      {@html sanitizeHtml(contentHtml ?? "")}
    </p>
  </div>
{/if}
