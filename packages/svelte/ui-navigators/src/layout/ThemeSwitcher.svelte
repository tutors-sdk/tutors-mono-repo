<script lang="ts">
  import { themeService } from "@tutors/themes";
  import { t } from "@tutors/i18n";
</script>
<select class="select w-full" aria-label={t("nav.layout.theme")} value={themeService.currentTheme.value} onchange={(event) => themeService.setTheme(event.currentTarget.value)}>
  {#each themeService.themes as theme}<option value={theme.name}>{theme.name.charAt(0).toUpperCase() + theme.name.slice(1)}</option>{/each}
</select>
