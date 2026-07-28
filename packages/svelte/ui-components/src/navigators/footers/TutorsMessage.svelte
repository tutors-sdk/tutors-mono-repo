<script lang="ts">
  import { convertMdToHtml } from "@tutors/tutors-model-lib";
  import { onMount } from "svelte";
  import { t } from "@tutors/i18n";
  import { sanitizeHtml } from "../../utils/sanitize";
  let contentHtml = "";

  onMount(async () => {
    contentHtml = convertMdToHtml(t("footer.message"));
  });
</script>

{#if contentHtml}
  <div class="flex w-full justify-center">
    <p class="prose prose-sm prose-slate dark:prose-invert min-w-full">
      {@html sanitizeHtml(contentHtml ?? "")}
    </p>
  </div>
{/if}
