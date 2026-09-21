<script lang="ts">
  import { liveService } from "@tutors/community";
  import Courses from "@tutors/ui-components/time/Courses.svelte";
  import CoursesGroup from "@tutors/ui-components/time/CoursesGroup.svelte";
  import Students from "@tutors/ui-components/time/Students.svelte";
  import { Tabs } from "@skeletonlabs/skeleton-svelte";

  liveService.startGlobalPresenceService();
</script>

<div class="ui-page">
  <h1 class="ui-title mb-6">Tutors Live</h1>
  <p class="ui-muted mb-6">Course activity shared by connected learners.</p>
  {#if liveService.studentsOnline.value.length === 0}<p class="ui-empty mb-6">No learners are sharing activity right now.</p>{/if}
  <Tabs defaultValue="Courses">
    <Tabs.List>
      <Tabs.Trigger value="Courses">Courses ({liveService.coursesOnline.value.length})</Tabs.Trigger>
      <Tabs.Trigger value="Students">Students ({liveService.studentsOnline.value.length})</Tabs.Trigger>
      <Tabs.Trigger value="Groups">Groups</Tabs.Trigger>
      <Tabs.Indicator />
    </Tabs.List>
    <Tabs.Content value="Courses"><Courses /></Tabs.Content>
    <Tabs.Content value="Students"><Students /></Tabs.Content>
    <Tabs.Content value="Groups"><CoursesGroup /></Tabs.Content>
  </Tabs>
</div>
