<script lang="ts">
  import { themeService } from "@tutors/themes";
  import { t } from "@tutors/i18n";
  const choices = ["compacted", "expanded"] as const;
</script>
<select class="select w-full" aria-label={t("nav.layout.layout")} value={themeService.layout.value} onchange={(event) => themeService.setLayout(event.currentTarget.value)}>
  {#each choices as choice}<option value={choice}>{t(`shell.${choice}`)}</option>{/each}
</select>
