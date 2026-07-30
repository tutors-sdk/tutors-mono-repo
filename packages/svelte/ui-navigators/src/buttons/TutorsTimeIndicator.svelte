<script lang="ts">
  import { currentCourse, tutorsId } from "@tutors/runes";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";
</script>

{#if currentCourse?.value?.authLevel! > 0 && tutorsId?.value?.share === "true"}
  <div class="hover:preset-tonal-secondary rounded-lg p-2">
    <Icon link="https://time.tutors.dev/{currentCourse?.value?.courseId}" type="tutorsTime" tip={t("nav.time.tip")} />
  </div>
{/if}
