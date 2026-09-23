<script lang="ts">
  import { themeService } from "@tutors/themes";
  import { t } from "@tutors/i18n";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  const full = $derived(themeService.fullWidthReading.value);
</script>
<!-- Lets the reader drop the comfortable line length; only shown when the panel is wider than that length. -->
<button class="ui-button width-toggle" aria-pressed={full} onclick={() => themeService.setFullWidthReading(!full)}>
  <Icon icon={full ? "lucide:fold-horizontal" : "lucide:unfold-horizontal"} height="16" />
  {t("shell.fullWidth")}
</button>
<style>
  .width-toggle { min-height: 32px; padding: var(--space-1) var(--space-3); font-size: var(--font-meta); color: var(--ui-muted); }
  .width-toggle[aria-pressed="true"] { color: var(--ui-brand); }
  @container (max-width: 55rem) { .width-toggle { display: none; } }
</style>
