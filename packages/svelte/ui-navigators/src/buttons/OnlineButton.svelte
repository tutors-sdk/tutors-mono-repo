<script lang="ts">
  import { presenceService } from "@tutors/community";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import StudentCard from "@tutors/ui-primitives/components/StudentCard.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";
  let open = $state(false);
  const label = $derived(`${t("nav.online.view")} ${presenceService.studentsOnline.value.length} ${t("nav.online.online")}`);
</script>

{#snippet menuSelector()}
  <span class="nav-row"><Icon type="listOnline" /><span>{label}</span></span>
{/snippet}
{#snippet sidebarContent()}
  <div class="ui-grid card-grid online-grid">
    {#each presenceService.studentsOnline.value as lo}
      {#if lo?.user?.fullName !== "Anon"}
        <!-- Wrapped like the topic grid: the card grid sizes the wrapper, the card fills it. -->
        <div class="min-w-0">
          <StudentCard {lo} showCourseTitle={true} />
        </div>
      {/if}
    {/each}
  </div>
{/snippet}

<!-- No finalFocusEl: the trigger is a row of the course navigation that stays in the document while the
     dialog is open, so the dialog's own restore puts focus back on it. It needed the override only while
     it lived inside the account menu, which unmounts its trigger on close. -->
<Sidebar bind:open presentation="dialog" width="w-3xl" {menuSelector} {sidebarContent} ariaLabel={label} title={label} />
<style>
  /* Geometry comes from .ui-grid.card-grid in paper-ui.css: online students are the same fixed card as
     everywhere else, wrapped and centred. Only the top gap is local to the dialog. */
  .online-grid { margin-top: var(--space-2); }
</style>
