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
    <div class="footer-prose prose dark:prose-invert [&>*]:m-0 min-w-full">
      {@html sanitizeHtml(contentHtml ?? "")}
    </div>
  </div>
{/if}
<style>
  .footer-prose { max-width: none; font-size: var(--font-caption); line-height: var(--leading-ui); color: var(--ui-muted); }
</style>
