<script lang="ts">
  import type { CourseVisit } from "@tutors/connect";
  import Card from "@tutors/ui/learning-objects/layout/Card.svelte";

  interface Props {
    courseRecords: CourseVisit[];
  }
  let { courseRecords = [] }: Props = $props();
  // tabSet.value = 4;
</script>

<div class="flex flex-wrap justify-center">
  {#each courseRecords as courseRecord}
    <Card
      cardDetails={{
        route: `/course/${courseRecord?.id}`,
        title: courseRecord?.title,
        type: "course",
        summary: courseRecord?.credits,
        metric: courseRecord?.visits?.toString(),
        img: courseRecord?.img,
        icon: courseRecord?.icon
      }}
      cardLayout={{
        layout: "compacted",
        style: "landscape"
      }}
    />
  {/each}
</div>
