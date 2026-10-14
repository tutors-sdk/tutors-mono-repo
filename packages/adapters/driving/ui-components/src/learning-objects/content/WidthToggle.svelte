<script lang="ts">
  import { themeService } from "@tutors/themes";
  import { t } from "@tutors/i18n";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  const choices = [
    { full: false, icon: "lucide:fold-horizontal", label: "shell.standardWidth" },
    { full: true, icon: "lucide:unfold-horizontal", label: "shell.fullWidth" }
  ];
</script>
<!-- Lets the reader drop the comfortable line length; only shown when the panel is wider than that length.
     Styled like the light/dark switch in Preferences. -->
<div class="width-toggle" role="group" aria-label={t("shell.contentWidth")}>
  {#each choices as choice}<button class="ui-button" aria-pressed={themeService.fullWidthReading.value === choice.full} onclick={() => themeService.setFullWidthReading(choice.full)}><Icon icon={choice.icon} height="16" />{t(choice.label)}</button>{/each}
</div>
<style>
  .width-toggle { display: flex; padding: 2px; gap: 2px; border-radius: var(--radius-control); background: var(--ui-canvas); border: 1px solid var(--ui-border); }
  button { min-height: 30px; padding: var(--space-1) var(--space-3); gap: var(--space-1); font-size: var(--font-meta); background: transparent; border-color: transparent; color: var(--ui-muted); }
  button[aria-pressed="true"] { color: var(--ui-brand); background: var(--ui-surface); border-color: var(--ui-border); box-shadow: none; }
  @container (max-width: 55rem) { .width-toggle { display: none; } }
</style>
