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
  <div class="online-grid">
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

<Sidebar triggerClass="menu-row" bind:open presentation="dialog" width="w-3xl" {menuSelector} {sidebarContent} ariaLabel={label} title={label} finalFocusEl={() => document.querySelector<HTMLElement>('[data-tour="profile"] .paper-menu-trigger')} />
<style>
  .online-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: var(--space-4); }
</style>
