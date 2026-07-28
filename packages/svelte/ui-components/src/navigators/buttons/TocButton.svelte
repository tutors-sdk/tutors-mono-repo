<script lang="ts">
  import CourseContext from "@tutors/ui-components/learning-objects/structure/CourseContext.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { currentCourse } from "@tutors/runes";
  import { t } from "@tutors/i18n";
</script>

{#snippet menuSelector()}
  <div class="hover:preset-tonal-secondary rounded-lg p-2">
    <Icon type="coursetree" tip={t("nav.toc.tip")} height="40" />
  </div>
{/snippet}

{#snippet sidebarContent()}
  <header class="text-center">
    <h3 class="text-surface-500 text-lg">{currentCourse?.value?.title} {t("nav.toc.suffix")}</h3>
  </header>
  <article>
    <CourseContext />
  </article>
{/snippet}

<Sidebar position="right" {menuSelector} {sidebarContent} />
