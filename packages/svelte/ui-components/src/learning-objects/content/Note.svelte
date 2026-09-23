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
  const content = $derived((lo.contentHtml ?? "").replace(/<div class="table-of-contents">([\s\S]*?)<\/div>/g, '<details class="table-of-contents"><summary>On this page</summary>$1</details>'));
</script>

<div class="reading-panel"><article class="prose dark:prose-invert max-w-none overflow-x-auto" use:mermaidify use:copyCode>
  {#key currentCodeTheme.value}
    {@html sanitizeHtml(content)}
  {/key}
</article></div>

<svelte:head>
  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/katex@0.18.1/dist/katex.min.css"
  />
</svelte:head>
