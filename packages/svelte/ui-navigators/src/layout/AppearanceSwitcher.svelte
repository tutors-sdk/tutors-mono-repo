<script lang="ts">
  import { themeService } from "@tutors/themes";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";
  const choices = ["light", "dark"] as const;
</script>
<div class="preference-choices" role="group" aria-label={t("nav.layout.appearance")}>
  {#each choices as choice}<button class="ui-button" aria-pressed={themeService.lightMode.value === choice} onclick={() => themeService.setDisplayMode(choice)}><Icon icon={choice === "light" ? "lucide:sun" : "lucide:moon"} height="18" />{t(`shell.${choice}`)}</button>{/each}
</div>
<style>
  .preference-choices { display: flex; padding: var(--space-1); gap: var(--space-1); border-radius: var(--radius-control); background: var(--ui-canvas); border: 1px solid var(--ui-border); }
  button { flex: 1; background: transparent; border-color: transparent; color: var(--ui-muted); }
  button[aria-pressed="true"] { color: var(--ui-brand); background: var(--ui-surface); border-color: var(--ui-border); box-shadow: none; }
</style>
