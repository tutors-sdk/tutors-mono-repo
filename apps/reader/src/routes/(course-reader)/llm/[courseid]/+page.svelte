<script lang="ts">
  import { goto } from "$app/navigation";
  import { currentCourse } from "@tutors/runes";
  import { convertMdToHtml } from "@tutors/tutors-model-lib";
  import SecondaryNavigator from "@tutors/ui-navigators/SecondaryNavigator.svelte";
  import type { PageData } from "./$types";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();

  $effect(() => { if (data.course.llm === 0) void goto(`/course/${data.course.courseId}`); });

  const headding = `
# Docs for LLMs

Tutors supports the [llms.txt](https://llmstxt.org/) convention for making documentation available to large language models and the applications that make use of them.

## Complete Course Content
`;
  const headdingHtml = convertMdToHtml(headding);
</script>

<SecondaryNavigator lo={currentCourse.value} parentCourse={currentCourse.value?.properties?.parent} />
<div class="reader-content">
  <div class="reading-panel">
    <div class="prose dark:prose-invert">
      {@html sanitizeHtml(headdingHtml ?? "")}
      {@html sanitizeHtml(data.llmsLinks ?? "")}
    </div>
  </div>
</div>
