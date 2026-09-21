<script lang="ts">
  import { tutorsConnectService, type CourseVisit } from "@tutors/connect";
  import { onMount } from "svelte";
  import CourseVisitCard from "./CourseVisitCard.svelte";
  import { t } from "@tutors/i18n";

  let loaded = $state(false);
  let failed = $state(false);
  let courseVisits: CourseVisit[] = $state([]);
  async function loadCourses() {
    failed = false;
    try { courseVisits = await tutorsConnectService.getCourseVisits(); }
    catch { failed = true; }
    finally { loaded = true; }
  }
  onMount(loadCourses);

  function deleteCourse(id: string) {
    tutorsConnectService.deleteCourseVisit(id);
    courseVisits = courseVisits.filter((c) => c.id !== id);
  }

  async function starUnstarCourse(id: string) {
    const course = courseVisits.find((c) => c.id === id);
    if (course) {
      if (course.favourite) {
        await tutorsConnectService.unfavouriteCourse(course.id);
      } else {
        await tutorsConnectService.favouriteCourse(course.id);
      }
    }
    courseVisits = await tutorsConnectService.getCourseVisits();
  }
</script>

<div class="course-history">
  {#if !loaded}<p role="status">{t("shell.loading")}</p>{/if}
  {#if failed}<div role="alert" class="ui-empty">{t("shell.loadError")} <button class="ui-button" onclick={loadCourses}>{t("shell.retry")}</button></div>{/if}
  <h2 class="mt-8 mb-4 text-xl font-semibold">{t("home.favourites")}</h2>
  <div class="ui-grid">
    {#each courseVisits.filter((cv) => cv.favourite) as courseVisit (courseVisit.id)}
      <CourseVisitCard {courseVisit} {deleteCourse} {starUnstarCourse} />
    {/each}
  </div>

  {#if loaded && !courseVisits.some(cv => cv.favourite)}<p class="ui-empty">{t("shell.emptyFavourites")}</p>{/if}
  <h2 class="mt-8 mb-4 text-xl font-semibold">{t("home.recentlyAccessed")}</h2>
  <div class="ui-grid">
    {#each courseVisits.filter((cv) => !cv.favourite) as courseVisit (courseVisit.id)}
      <CourseVisitCard {courseVisit} {deleteCourse} {starUnstarCourse} />
    {/each}
  </div>
  {#if loaded && !courseVisits.some(cv => !cv.favourite)}<p class="ui-empty">{t("shell.emptyCourses")}</p>{/if}
</div>
