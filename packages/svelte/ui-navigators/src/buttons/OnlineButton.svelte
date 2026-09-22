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
  <span class="online-trigger">{label}<Icon type="listOnline" height="20" /></span>
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

<Sidebar bind:open presentation="dialog" width="w-3xl" {menuSelector} {sidebarContent} ariaLabel={label} title={label} finalFocusEl={() => document.querySelector<HTMLElement>('[data-tour="profile"] .paper-menu-trigger')} />
<style>
  .online-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: var(--space-4); }
  .online-trigger { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: 44px; padding: var(--space-3); font-size: var(--font-label); color: var(--ui-ink); text-align: left; }
</style>
