<script lang="ts">
  import CourseList from "./CourseList.svelte";
  import TutorsInfo from "./TutorsInfo.svelte";
  import Welcome from "./Welcome.svelte";
  import { t } from "@tutors/i18n";
</script>
<div class="ui-page">
  <TutorsInfo />
  <section class="my-courses" aria-labelledby="my-courses-title">
    <header class="my-courses-header">
      <div>
        <p class="ui-eyebrow">{t("shell.myCourses")}</p>
        <h2 id="my-courses-title" class="ui-title">{t("shell.welcome")}</h2>
        <p class="ui-muted">{t("shell.welcomeDescription")}</p>
      </div>
      <Welcome />
    </header>
    <CourseList />
  </section>
</div>

<style>
  .my-courses { margin-top: var(--space-10); }
  .my-courses-header { display: flex; align-items: end; justify-content: space-between; gap: var(--space-8); }
  .my-courses-header > div:first-child { min-width: 0; }
  .my-courses-header .ui-title { margin-top: var(--space-2); }
  .my-courses-header .ui-muted { margin-top: var(--space-2); }
  @media (max-width: 767px) { .my-courses-header { align-items: stretch; flex-direction: column; gap: var(--space-5); } }
</style>
