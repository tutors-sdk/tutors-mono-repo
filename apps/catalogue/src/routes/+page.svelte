<script lang="ts">
  import { t } from "@tutors/i18n";
  import { catalogueService } from "@tutors/community";
  import Catalogue from "@tutors/ui-components/time/Catalogue.svelte";
  import { onMount } from "svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
  let totalStudents = $state(0);
  onMount(async () => {
    totalStudents = await catalogueService.getStudentCount();
  });
</script>

<div class="ui-page">
  <header class="catalogue-header">
    <p class="ui-eyebrow">{t("home.catalogue")}</p>
    <h1 class="ui-title">Tutors Catalogue</h1>
    <p class="ui-muted">{t("catalogue.summary")} {data.courseRecords.length} {t("catalogue.modules")} · {totalStudents} {t("catalogue.students")}</p>
  </header>
  <Catalogue courseRecords={data.courseRecords} />
</div>

<style>
  .catalogue-header { margin-bottom: var(--space-8); }
  .catalogue-header .ui-title, .catalogue-header .ui-muted { margin-top: var(--space-2); }
</style>
