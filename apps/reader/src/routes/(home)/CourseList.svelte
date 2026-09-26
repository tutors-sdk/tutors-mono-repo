<script lang="ts">
  import { cardProgress, loadProgress, tutorsConnectService, type CourseVisit, type HomeProgress } from "@tutors/connect";
  import { tutorsId } from "@tutors/runes";
  import { onMount } from "svelte";
  import CourseVisitCard from "./CourseVisitCard.svelte";
  import { t } from "@tutors/i18n";

  let loaded = $state(false);
  let failed = $state(false);
  let courseVisits: CourseVisit[] = $state([]);
  let progress: HomeProgress = $state({ kind: "signed-out" });
  async function loadCourses() {
    failed = false;
    try { courseVisits = await tutorsConnectService.getCourseVisits(); }
    catch { failed = true; }
    finally { loaded = true; }
  }
  onMount(loadCourses);

  // The session can arrive after the list mounts, so progression follows the signed-in login.
  $effect(() => {
    if (tutorsId.value?.login) loadProgress().then((p) => (progress = p));
    else progress = { kind: "signed-out" };
  });

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
  <h2 class="ui-section-title mt-8 mb-4">{t("home.favourites")}</h2>
  <!-- Plain ui-grid, not card-grid: a course tile carries four detail lines and a three-button footer,
       so it needs roughly 450px in a 220px column and will not fit the fixed resource-card box. The
       grid's default stretch gives every tile in a row the height of the tallest instead. -->
  <div class="ui-grid course-grid">
    {#each courseVisits.filter((cv) => cv.favourite) as courseVisit (courseVisit.id)}
      <CourseVisitCard {courseVisit} progress={cardProgress(progress, courseVisit.id)} {deleteCourse} {starUnstarCourse} />
    {/each}
  </div>

  {#if loaded && !courseVisits.some(cv => cv.favourite)}<p class="ui-empty">{t("shell.emptyFavourites")}</p>{/if}
  <h2 class="ui-section-title mt-8 mb-4">{t("home.recentlyAccessed")}</h2>
  <div class="ui-grid course-grid">
    {#each courseVisits.filter((cv) => !cv.favourite) as courseVisit (courseVisit.id)}
      <CourseVisitCard {courseVisit} progress={cardProgress(progress, courseVisit.id)} {deleteCourse} {starUnstarCourse} />
    {/each}
  </div>
  {#if loaded && !courseVisits.some(cv => !cv.favourite)}<p class="ui-empty">{t("shell.emptyCourses")}</p>{/if}
</div>

<style>
  /* auto-fill rather than the shared grid's auto-fit: Recently accessed usually holds fewer tiles than
     Favourites, and auto-fit collapses the empty tracks, so its tiles came out far wider than the list
     above. auto-fill keeps the track count the same in both. */
  /* grid-auto-rows: 1fr squares every row off against the tallest tile in the list, so a short final row
     is the same height as a full one rather than shrinking to its own content. */
  .course-grid { grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); grid-auto-rows: 1fr; }
</style>
