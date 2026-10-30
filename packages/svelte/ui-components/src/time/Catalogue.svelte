<script lang="ts">
  import { t } from "@tutors/i18n";
  import type { CourseVisit } from "@tutors/connect";
  import { arrangeCatalogue, CATALOGUE_SORTS, type CatalogueSort } from "@tutors/community";
  import Card from "@tutors/ui-components/learning-objects/layout/Card.svelte";
  import { siteUrls } from "@tutors/ui-primitives/utils/site-urls";

  interface Props {
    courseRecords: CourseVisit[];
  }
  let { courseRecords = [] }: Props = $props();
  let sort: CatalogueSort = $state("visits");
  let search = $state("");
  const shown = $derived(arrangeCatalogue(courseRecords, sort, search));
</script>

<section class="ui-panel">
  <h2 class="ui-section-title catalogue-heading">{t(`catalogue.sort.${sort}.heading`)}</h2>
  <div class="catalogue-controls">
    <label class="catalogue-control">{t("catalogue.search.label")}<input class="input" type="search" bind:value={search} placeholder={t("catalogue.search.placeholder")} /></label>
    <label class="catalogue-control">{t("catalogue.sort.label")}<select class="select" bind:value={sort}>
        {#each CATALOGUE_SORTS as option (option)}<option value={option}>{t(`catalogue.sort.${option}`)}</option>{/each}
      </select></label>
  </div>
  {#if search.trim() && courseRecords.length}<p class="ui-muted catalogue-matches" role="status">{shown.length} / {courseRecords.length}</p>{/if}
  <div class="ui-grid card-grid">
    {#each shown as courseRecord (courseRecord.id)}
      <div class="min-w-0">
        <Card
          cardDetails={{
            route: `${siteUrls.reader}/course/${courseRecord?.id}`,
            title: courseRecord?.title,
            type: "course",
            summary: courseRecord?.credits,
            metric: courseRecord?.visits ? `${courseRecord.visits} ${t("catalogue.visits")}` : undefined,
            img: courseRecord?.img,
            icon: courseRecord?.icon
          }}
        />
      </div>
    {:else}<p class="ui-empty">{courseRecords.length ? t("catalogue.search.none") : t("catalogue.empty")}</p>
    {/each}
  </div>
</section>

<style>
  .catalogue-heading { margin-bottom: var(--space-4); }
  .catalogue-controls { display: flex; flex-wrap: wrap; gap: var(--space-4); margin-bottom: var(--space-4); }
  .catalogue-control { display: flex; flex: 1 1 14rem; flex-direction: column; gap: var(--space-2); color: var(--ui-muted); font-size: var(--font-label); }
  .catalogue-control input, .catalogue-control select { min-height: 44px; padding: var(--space-2) var(--space-3); border: 1px solid var(--ui-control-border); border-radius: var(--radius-control); color: var(--ui-ink); background-color: var(--ui-surface); font-size: var(--font-control); }
  .catalogue-matches { margin-bottom: var(--space-4); }
</style>
