<script lang="ts">
  import type { NotebookCell } from "@tutors/tutors-model-lib";
  import { sanitizeHtml } from "../../../../utils/sanitize";

  interface Props {
    cell: NotebookCell;
  }
  let { cell }: Props = $props();
</script>

<div class="p-4">
  <article class="prose dark:prose-invert max-w-none">
    {@html sanitizeHtml(cell.sourceHtml ?? "")}
  </article>
</div>
