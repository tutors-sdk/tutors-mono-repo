<script lang="ts">
  import CourseList from "./CourseList.svelte";
  import TutorsInfo from "./TutorsInfo.svelte";
  import Welcome from "./Welcome.svelte";
  import { t } from "@tutors/i18n";
</script>
<div class="ui-page">
  <TutorsInfo />
  <p class="ui-eyebrow mt-8">{t("shell.myCourses")}</p>
  <h2 class="ui-title mt-2">{t("shell.welcome")}</h2>
  <p class="ui-muted mt-2">{t("shell.welcomeDescription")}</p>
  <Welcome />
  <CourseList />
</div>
