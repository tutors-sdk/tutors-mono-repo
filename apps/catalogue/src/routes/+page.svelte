<script lang="ts">
  import { catalogueService } from "@tutors/community";
  import Catalogue from "@tutors/ui-components/time/Catalogue.svelte";
  import { onMount } from "svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
  let totalModules = $state(0);
  let totalStudents = $state(0);
  onMount(async () => {
    totalModules = await data.courseRecords.length;
    totalStudents = await catalogueService.getStudentCount();
  });
</script>

<div class="ui-page">
  <h1 class="ui-title mb-6">Tutors Catalogue</h1>
  <div class="flex justify-end gap-2">
    <div class="ui-muted mb-4 text-right text-sm">
      {totalModules} modules · {totalStudents} students
    </div>
  </div>
  <Catalogue courseRecords={data.courseRecords} />
</div>
