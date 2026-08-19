<script lang="ts">
  import EducatorPanel from "../lecturer/EducatorPanel.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";

  let { showPanel = false } = $props();
</script>

{#if showPanel}
  {#snippet menuSelector()}
    <div class="hover:preset-tonal-secondary rounded-lg p-2">
      <Icon type="lecturer" tip={t("lecturer.panel.tip")} height="30" />
    </div>
  {/snippet}

  {#snippet sidebarContent()}
    <EducatorPanel />
  {/snippet}

  <Sidebar position="right" {menuSelector} {sidebarContent} />
{/if}
