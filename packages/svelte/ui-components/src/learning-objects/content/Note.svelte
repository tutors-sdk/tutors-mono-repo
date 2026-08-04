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
    href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css"
    integrity="sha384-GvrOXuhMATgEsSwCs4smul74iXGOixntILdUW9XmUC6+HX0sLNAK3q71HotJqlAn"
    crossorigin="anonymous"
  />
</svelte:head>

<style>
  :global(.notecontent pre) {
    color: white;
  }
</style>
