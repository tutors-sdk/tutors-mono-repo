<script lang="ts">
  import { t } from "@tutors/i18n";
  import { liveService } from "@tutors/community";
  import Card from "@tutors/ui-components/learning-objects/layout/Card.svelte";
  import { siteUrls } from "@tutors/ui-primitives/utils/site-urls";
</script>

<section class="ui-panel">
  <div class="ui-grid card-grid">
    {#each liveService.coursesOnline.value as lo}
      <div class="min-w-0">
        <Card
          cardDetails={{
            route: `${siteUrls.reader}${lo.loRoute}`,
            title: lo.courseTitle,
            type: lo.type,
            summary: lo.title,
            img: lo.img,
            icon: lo.icon
          }}
        />
      </div>
    {:else}<p class="ui-empty">{t("live.emptyCourses")}</p>
    {/each}
  </div>
</section>
