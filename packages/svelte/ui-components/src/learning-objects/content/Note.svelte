<script lang="ts">
  import { currentCodeTheme } from "@tutors/course/markdown";
  import { mermaidify } from "@tutors/course/markdown";
  import { copyCode } from "@tutors/course/markdown";
  import type { Lo } from "@tutors/tutors-model-lib";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";

  interface Props {
    lo: Lo;
  }
  let { lo }: Props = $props();
</script>

<article class="prose dark:prose-invert mr-4 max-w-none overflow-x-auto" use:mermaidify use:copyCode>
  {#key currentCodeTheme.value}
    {@html sanitizeHtml(lo.contentHtml ?? "")}
  {/key}
</article>

<svelte:head>
  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/katex@0.18.1/dist/katex.min.css"
  />
</svelte:head>

<style>
  :global(.notecontent pre) {
    color: white;
  }
</style>
