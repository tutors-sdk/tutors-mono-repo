<script lang="ts">
  import { t } from "@tutors/i18n";
  import { liveService } from "@tutors/community";
  import Courses from "@tutors/ui-components/time/Courses.svelte";
  import CoursesGroup from "@tutors/ui-components/time/CoursesGroup.svelte";
  import Students from "@tutors/ui-components/time/Students.svelte";
  import { Tabs } from "@skeletonlabs/skeleton-svelte";

  liveService.startGlobalPresenceService();
</script>

<div class="ui-page">
  <header class="live-header">
    <p class="ui-eyebrow">{t("home.live")}</p>
    <h1 class="ui-title">Tutors Live</h1>
    <p class="ui-muted">{t("live.summary")}</p>
  </header>
  <Tabs defaultValue="Courses">
    <Tabs.List>
      <Tabs.Trigger value="Courses">{t("live.courses")} ({liveService.coursesOnline.value.length})</Tabs.Trigger>
      <Tabs.Trigger value="Students">{t("live.students")} ({liveService.studentsOnline.value.length})</Tabs.Trigger>
      <Tabs.Trigger value="Groups">{t("live.groups")}</Tabs.Trigger>
      <Tabs.Indicator />
    </Tabs.List>
    <Tabs.Content value="Courses"><Courses /></Tabs.Content>
    <Tabs.Content value="Students"><Students /></Tabs.Content>
    <Tabs.Content value="Groups"><CoursesGroup /></Tabs.Content>
  </Tabs>
</div>

<style>
  .live-header { margin-bottom: var(--space-8); }
  .live-header .ui-title, .live-header .ui-muted { margin-top: var(--space-2); }
</style>
