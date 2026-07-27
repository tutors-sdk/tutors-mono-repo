<script lang="ts">
  import { currentCourse } from "@tutors/runes";
  import Icon from "@tutors/ui/components/Icon.svelte";
  import { t } from "@tutors/i18n";
</script>

{#if currentCourse?.value?.llm === 2}
  <div class="hover:preset-tonal-secondary rounded-lg p-2">
    <Icon link="/llm/{currentCourse?.value?.courseId}" type="llm" tip={t("nav.llms.tip")} />
  </div>
{/if}
