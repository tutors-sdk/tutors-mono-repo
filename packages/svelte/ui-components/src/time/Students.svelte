<script lang="ts">
  import { t } from "@tutors/i18n";
  import { liveService } from "@tutors/community";
  import StudentCard from "@tutors/ui-primitives/components/StudentCard.svelte";

  const students = $derived(liveService.studentsOnline.value.filter((lo) => lo?.user));
</script>

<section class="ui-panel">
  <div class="ui-grid card-grid">
    {#each students as lo}
      <div class="min-w-0"><StudentCard {lo} showCourseTitle={true} /></div>
    {:else}<p class="ui-empty">{t("live.emptyStudents")}</p>
    {/each}
  </div>
</section>
