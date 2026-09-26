<script lang="ts">
  import type { CourseVisit } from "@tutors/connect";
  import Card from "@tutors/ui-components/learning-objects/layout/Card.svelte";

  interface Props {
    courseRecords: CourseVisit[];
  }
  let { courseRecords = [] }: Props = $props();
</script>

<section class="ui-panel">
  <h2 class="ui-section-title catalogue-heading">Most visited courses</h2>
  <div class="ui-grid card-grid">
    {#each courseRecords as courseRecord}
      <div class="min-w-0">
        <Card
          cardDetails={{
            route: `https://tutors.dev/course/${courseRecord?.id}`,
            title: courseRecord?.title,
            type: "course",
            summary: courseRecord?.credits,
            metric: courseRecord?.visits ? `${courseRecord.visits} visits` : undefined,
            img: courseRecord?.img,
            icon: courseRecord?.icon
          }}
        />
      </div>
    {:else}<p class="ui-empty">No courses are available to display.</p>
    {/each}
  </div>
</section>

<style>
  .catalogue-heading { margin-bottom: var(--space-4); }
</style>
