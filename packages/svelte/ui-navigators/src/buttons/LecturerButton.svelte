<script lang="ts">
  import LecturerPanel from "../lecturer/LecturerPanel.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { currentCourse } from "@tutors/runes";
  import { t } from "@tutors/i18n";
</script>

{#if currentCourse?.value?.authLevel === 2}
  {#snippet menuSelector()}
    <div class="hover:preset-tonal-secondary rounded-lg p-2">
      <Icon type="lecturer" tip={t("lecturer.panel.tip")} height="30" />
    </div>
  {/snippet}

  {#snippet sidebarContent()}
    <LecturerPanel />
  {/snippet}

  <Sidebar position="right" {menuSelector} {sidebarContent} />
{/if}
