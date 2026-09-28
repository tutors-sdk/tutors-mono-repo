<script lang="ts">
  import { t } from "@tutors/i18n";
  import type { CourseVisit } from "@tutors/connect";
  import Card from "@tutors/ui-components/learning-objects/layout/Card.svelte";

  interface Props {
    courseRecords: CourseVisit[];
  }
  let { courseRecords = [] }: Props = $props();
</script>

<section class="ui-panel">
  <h2 class="ui-section-title catalogue-heading">{t("catalogue.mostVisited")}</h2>
  <div class="ui-grid card-grid">
    {#each courseRecords as courseRecord}
      <div class="min-w-0">
        <Card
          cardDetails={{
            route: `https://tutors.dev/course/${courseRecord?.id}`,
            title: courseRecord?.title,
            type: "course",
            summary: courseRecord?.credits,
            metric: courseRecord?.visits ? `${courseRecord.visits} ${t("catalogue.visits")}` : undefined,
            img: courseRecord?.img,
            icon: courseRecord?.icon
          }}
        />
      </div>
    {:else}<p class="ui-empty">{t("catalogue.empty")}</p>
    {/each}
  </div>
</section>

<style>
  .catalogue-heading { margin-bottom: var(--space-4); }
</style>
