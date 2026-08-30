<script lang="ts">
  import { currentCourse } from "@tutors/runes";
  import CourseShell from "@tutors/ui-navigators/TutorsShell.svelte";
  import type { Snippet } from "svelte";
  type Props = { children: Snippet };
  let { children }: Props = $props();

  currentCourse.value = null;
</script>

<svelte:head>
  <title>Tutors - Create a Course</title>
</svelte:head>

<CourseShell>
  {@render children()}
</CourseShell>
