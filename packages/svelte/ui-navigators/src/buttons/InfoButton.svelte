<script lang="ts">
  import { currentCourse } from "@tutors/runes";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import { t } from "@tutors/i18n";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
</script>

{#snippet menuSelector()}
  <div class="hover:preset-tonal-secondary rounded-lg p-2">
    <Icon type="info" tip={t("nav.info.tip")} height="25" />
  </div>
{/snippet}

{#snippet sidebarContent()}
  <header class="flex justify-between">
    <h2 class="h2">{t("nav.info.title")}</h2>
  </header>
  <article>
    <div class="prose dark:prose-invert">
      {@html sanitizeHtml(currentCourse?.value?.contentHtml ?? "")}
    </div>
  </article>
{/snippet}

<Sidebar {menuSelector} {sidebarContent} />
