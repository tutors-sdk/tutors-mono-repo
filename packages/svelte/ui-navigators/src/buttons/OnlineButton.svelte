<script lang="ts">
  import { presenceService } from "@tutors/community";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import StudentCard from "@tutors/ui-primitives/components/StudentCard.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";
  let { onOpen }: { onOpen?: () => void } = $props();
  let open = $state(false);
  $effect(() => { if (open) onOpen?.(); });
  const label = $derived(`${t("nav.online.view")} ${presenceService.studentsOnline.value.length} ${t("nav.online.online")}`);
</script>

{#snippet menuSelector()}
  <span class="menu-label">{label}</span><Icon type="listOnline" />
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

<Sidebar triggerClass="menu-row" bind:open presentation="dialog" width="w-3xl" {menuSelector} {sidebarContent} ariaLabel={label} title={label} finalFocusEl={() => document.querySelector<HTMLElement>('[data-tour="profile"] .paper-menu-trigger')} />
<style>
  /* Geometry comes from .ui-grid.card-grid in paper-ui.css: online students are the same fixed card as
     everywhere else, wrapped and centred. Only the top gap is local to the dialog. */
  .online-grid { margin-top: var(--space-2); }
</style>
