<script lang="ts">
  import CourseContext from "../CourseContext.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { currentCourse } from "@tutors/runes";
  import { t } from "@tutors/i18n";
  let { labelled = false } = $props();
</script>

{#snippet menuSelector()}
  <div class="nav-row">
    <Icon type="coursetree" tip={t("nav.toc.tip")} height="20" />
    {#if labelled}<span>{t("nav.toc.suffix")}</span>{/if}
  </div>
{/snippet}

{#snippet sidebarContent()}
  <article>
    <CourseContext />
  </article>
{/snippet}

<div data-tour="toc">
  <Sidebar width="w-lg" description={currentCourse.value?.title ?? ""} title={t("nav.toc.suffix")} position="right" {menuSelector} {sidebarContent} ariaLabel={t("nav.toc.tip")} />
</div>
