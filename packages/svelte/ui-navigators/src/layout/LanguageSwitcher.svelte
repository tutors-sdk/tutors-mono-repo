<script lang="ts">
  import { locale, setLocale, SUPPORTED_LOCALES, type SupportedLocale, t } from "@tutors/i18n";
  const labels: Record<SupportedLocale, string> = { en: "English", fr: "Français", de: "Deutsch", it: "Italiano", es: "Español", ga: "Gaeilge" };
</script>
<select class="select w-full" aria-label={t("nav.layout.language")} value={locale.value} onchange={(event) => setLocale(event.currentTarget.value as SupportedLocale)}>
  {#each SUPPORTED_LOCALES as item}<option value={item}>{labels[item]}</option>{/each}
</select>
