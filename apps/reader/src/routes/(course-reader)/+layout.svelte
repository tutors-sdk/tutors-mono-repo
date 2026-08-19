<script lang="ts">
  import CourseShell from "@tutors/ui-navigators/TutorsShell.svelte";
  import type { Snippet } from "svelte";
  import { tutorsConnectService } from "@tutors/connect";
  import { page } from "$app/state";
  import { currentCourse, isEducator, contentLocks } from "@tutors/runes";
  import { afterNavigate, goto } from "$app/navigation";

  type Props = { children: Snippet };
  let { children }: Props = $props();

  const hiddenRoutes = ["/lab/", "/note/", "/tutorial/"];
  let hideNavigator = $derived(hiddenRoutes.some((r) => page.route.id?.includes(r)));

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

  afterNavigate(({ to }) => {
    if (currentCourse.value?.hasEnrollment && !isEducator.value && to?.url?.pathname) {
      for (const [route, locked] of contentLocks.value) {
        if (locked && to.url.pathname.includes(route)) {
          goto(`/course/${currentCourse.value.courseId}`);
          return;
        }
      }
    }
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
