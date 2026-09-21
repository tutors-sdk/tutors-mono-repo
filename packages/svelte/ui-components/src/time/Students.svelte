<script lang="ts">
  import { liveService } from "@tutors/community";
  import StudentCard from "@tutors/ui-primitives/components/StudentCard.svelte";
</script>

<div class="ui-grid">
  {#each liveService.studentsOnline.value as lo}
    {#if lo?.user}
      <StudentCard
        {lo}
        showCourseTitle={true}
        cardLayout={{
          layout: "expanded",
          style: "landscape"
        }}
      />
    {/if}
  {/each}
</div>
