<script lang="ts">
  import { presenceService } from "@tutors/community";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import StudentCard from "../../time/StudentCard.svelte";
  import { t } from "@tutors/i18n";
</script>

{#snippet menuSelector()}
  <div class="ml-6">
    {t("nav.online.view")} <span class="badge bg-error-500 text-white">{presenceService.studentsOnline.value.length}</span> {t("nav.online.online")}
  </div>
{/snippet}
{#snippet sidebarContent()}
  <div class="flex flex-wrap justify-center">
    {#each presenceService.studentsOnline.value as lo}
      {#if lo?.user?.fullName !== "Anon"}
        <StudentCard
          {lo}
          showCourseTitle={true}
          cardLayout={{
            layout: "compacted",
            style: "landscape"
          }}
        />
      {/if}
    {/each}
  </div>
{/snippet}

<Sidebar position="right" {menuSelector} {sidebarContent} />
