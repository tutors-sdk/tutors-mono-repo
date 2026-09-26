<script lang="ts">
  import { liveService } from "@tutors/community";
  import Card from "@tutors/ui-components/learning-objects/layout/Card.svelte";
</script>

<section class="ui-panel">
  <div class="ui-grid card-grid">
    {#each liveService.coursesOnline.value as lo}
      <div class="min-w-0">
        <Card
          cardDetails={{
            route: `https://tutors.dev${lo.loRoute}`,
            title: lo.courseTitle,
            type: lo.type,
            summary: lo.title,
            img: lo.img,
            icon: lo.icon
          }}
        />
      </div>
    {:else}<p class="ui-empty">No courses have shared activity yet.</p>
    {/each}
  </div>
</section>
