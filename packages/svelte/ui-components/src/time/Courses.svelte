<script lang="ts">
  import { liveService } from "@tutors/community";
  import Card from "@tutors/ui-components/learning-objects/layout/Card.svelte";
</script>

<div class="ui-grid">
  {#each liveService.coursesOnline.value as lo}
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
  {/each}
</div>
