<script lang="ts">
  import { currentCourse } from "@tutors/runes";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import { t } from "@tutors/i18n";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";

  let { labelled = false } = $props();
</script>

{#snippet menuSelector()}
  <div class="nav-row">
    <Icon type="info" tip={t("nav.info.tip")} height="20" />
    {#if labelled}<span>{t("nav.info.title")}</span>{/if}
  </div>
{/snippet}

{#snippet sidebarContent()}
  <article>
    <div class="prose dark:prose-invert">
      {@html sanitizeHtml(currentCourse?.value?.contentHtml || currentCourse?.value?.summary || "")}
    </div>
  </article>
{/snippet}

<div data-tour="info">
  <Sidebar presentation="dialog" title={t("nav.info.title")} {menuSelector} {sidebarContent} width="w-xl" ariaLabel={t("nav.info.tip")} />
</div>
