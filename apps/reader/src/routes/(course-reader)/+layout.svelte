<script lang="ts">
  import CourseShell from "@tutors/ui-navigators/TutorsShell.svelte";
  import type { Snippet } from "svelte";
  import { tutorsConnectService } from "@tutors/connect";
  import { page } from "$app/state";
  import { currentCourse, isEducator, contentLocks, locksLoaded, tutorsId } from "@tutors/runes";
  import { rbacService, isLoRouteLocked } from "@tutors/rbac";
  import { afterNavigate, goto } from "$app/navigation";

  type Props = { children: Snippet };
  let { children }: Props = $props();

  const hiddenRoutes = ["/lab/", "/note/", "/tutorial/"];
  let hideNavigator = $derived(hiddenRoutes.some((r) => page.route.id?.includes(r)));

  tutorsConnectService.startTimer();

  let lastCourseId = "";
  let roleLoadedForCourse = "";
  $effect(() => {
    tutorsConnectService.learningEvent(page.params);

    const course = currentCourse.value;
    const courseId = course?.courseId;
    if (!courseId) return;

    if (courseId !== lastCourseId) {
      tutorsConnectService.checkWhiteList();
      tutorsConnectService.courseVisit(course);
      lastCourseId = courseId;
      roleLoadedForCourse = "";
      return;
    }

    const login = tutorsId.value?.login;
    if (course.hasEnrollment && login && roleLoadedForCourse !== courseId) {
      rbacService.loadRole(login, courseId, course);
      rbacService.checkLecturerStatus(course);
      roleLoadedForCourse = courseId;
    }
  });

  afterNavigate(({ to }) => {
    if (
      currentCourse.value?.hasEnrollment &&
      !isEducator.value &&
      locksLoaded.value &&
      to?.url?.pathname
    ) {
      const pathname = to.url.pathname;
      const courseHome = `/course/${currentCourse.value.courseId}`;
      if (pathname === courseHome) return;

      const lo = currentCourse.value.loIndex?.get(pathname);
      const blocked = lo
        ? rbacService.isLoLocked(lo)
        : isLoRouteLocked(pathname, contentLocks.value);
      if (blocked) {
        void goto(courseHome, { replaceState: true });
        return;
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
