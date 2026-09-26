<script lang="ts">
  import { liveService } from "@tutors/community";
  import StudentCard from "@tutors/ui-primitives/components/StudentCard.svelte";

  const students = $derived(liveService.studentsOnline.value.filter((lo) => lo?.user));
</script>

<section class="ui-panel">
  <div class="ui-grid card-grid">
    {#each students as lo}
      <StudentCard {lo} showCourseTitle={true} />
    {:else}<p class="ui-empty">No students are sharing activity right now.</p>
    {/each}
  </div>
</section>
