<script lang="ts">
  import { themeService } from "@tutors/themes";
  import { courseService } from "@tutors/course/course";
  import { currentCodeTheme, markdownService } from "@tutors/course/markdown";
  import { currentCourse } from "@tutors/runes";
  import { t } from "@tutors/i18n";
  function changeTheme(value: string) {
    markdownService.setCodeTheme(value);
    if (currentCourse.value) courseService.refreshAllLabs(themeService.currentTheme.value);
  }
</script>
<select class="select w-full" aria-label={t("nav.layout.codeStyle")} value={currentCodeTheme.value} onchange={(event) => changeTheme(event.currentTarget.value)}>
  {#each markdownService.codeThemes as theme}<option value={theme.name}>{theme.displayName}</option>{/each}
</select>
