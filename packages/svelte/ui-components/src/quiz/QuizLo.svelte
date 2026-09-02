<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { currentCourse } from "@tutors/runes";
  import { parseQuizMarkdown } from "@tutors/quiz";
  import type { Quiz } from "@tutors/quiz";
  import type { Lo } from "@tutors/tutors-model-lib";
  import QuizAsync from "./QuizAsync.svelte";

  interface Props {
    lo: Lo;
  }
  let { lo }: Props = $props();

  const parsed = $derived(lo.contentMd ? parseQuizMarkdown(lo.contentMd) : null);

  const quiz = $derived.by((): Quiz | null => {
    if (!parsed) return null;
    return {
      id: lo.route,
      courseId: currentCourse.value?.courseId ?? "",
      title: parsed.title,
      questions: parsed.questions,
      createdBy: "course",
      source: "course",
      timeLimit: parsed.timeLimit,
      status: "published",
      createdAt: ""
    };
  });
</script>

{#if quiz}
  <QuizAsync {quiz} />
{:else}
  <div class="text-center py-12 text-error-500">
    Invalid quiz format in this learning object
  </div>
{/if}
