<script lang="ts">
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
    <p class="ui-eyebrow">Catalogue</p>
    <h1 class="ui-title">Tutors Catalogue</h1>
    <p class="ui-muted">Courses published with Tutors, most visited first. {data.courseRecords.length} modules · {totalStudents} students</p>
  </header>
  <Catalogue courseRecords={data.courseRecords} />
</div>

<style>
  .catalogue-header { margin-bottom: var(--space-8); }
  .catalogue-header .ui-title, .catalogue-header .ui-muted { margin-top: var(--space-2); }
</style>
