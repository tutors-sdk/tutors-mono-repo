<script lang="ts">
  import CourseShell from "@tutors/ui-navigators/TutorsShell.svelte";
  import type { Snippet } from "svelte";
  import { tutorsConnectService } from "@tutors/connect";
  import { page } from "$app/state";
  import { currentCourse, isEducator, contentLocks, locksLoaded, tutorsId } from "@tutors/runes";
  import { rbacService, isLoRouteLocked } from "@tutors/rbac";
  import { afterNavigate, goto } from "$app/navigation";
  import { revealMatches } from "@tutors/ui-navigators/search/resource-search";

  type Props = { children: Snippet };
  let { children }: Props = $props();


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
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      elemPage.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }
    // Move keyboard focus to the new page's content, unless the page has already
    // placed it on purpose (an element marked data-autofocus, like the search box).
    // Pages mount before this runs, so without the check focus is taken straight back.
    const main = document.getElementById("main-content");
    const active = document.activeElement;
    const placedByPage = active instanceof HTMLElement && active.hasAttribute("data-autofocus") && !!main?.contains(active);
    if (!placedByPage) main?.focus({ preventScroll: true });
    // Arriving from a search result (?highlight=words): highlight the words and scroll to the first match once
    // the page has rendered (an empty value clears the last page's highlight). Rule 0058.
    const words = page.url.searchParams.get("highlight") ?? "";
    if (main) {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      requestAnimationFrame(() => revealMatches(main, words, behavior));
    }
  });
</script>

<svelte:head>
  <title>{currentCourse?.value?.title}</title>
</svelte:head>

<CourseShell>
  <span id="content-panel"></span>

  {@render children()}
</CourseShell>
