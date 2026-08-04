<script lang="ts">
  import CourseShell from "@tutors/ui-navigators/TutorsShell.svelte";
  import type { Snippet } from "svelte";
  import { tutorsConnectService } from "@tutors/connect";
  import { page } from "$app/state";
  import { currentCourse, currentLo } from "@tutors/runes";
  import { afterNavigate } from "$app/navigation";

  type Props = { children: Snippet };
  let { children }: Props = $props();

  let hideNavigator = $derived(currentLo.value?.route !== "wall" && (currentLo.value?.type === "lab" || currentLo.value?.type === "note" || currentLo.value?.type === "tutorial"));

  tutorsConnectService.startTimer();

  let lastCourseId = "";
  $effect(() => {
    tutorsConnectService.learningEvent(page.params);

    if (currentCourse.value?.courseId !== lastCourseId) {
      tutorsConnectService.checkWhiteList();
      tutorsConnectService.courseVisit(currentCourse.value!);
      lastCourseId = currentCourse.value?.courseId!;
    }
  });

  afterNavigate(() => {
    const elemPage = document.querySelector("#content-panel");
    if (elemPage && window.innerWidth >= 600) {
      elemPage.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    document.getElementById("main-content")?.focus();
  });
</script>

<svelte:head>
  <title>{currentCourse?.value?.title}</title>
</svelte:head>

<CourseShell {hideNavigator}>
  <span id="content-panel" class="mt-[-60px] block pt-[60px]"></span>

  {@render children()}
</CourseShell>
