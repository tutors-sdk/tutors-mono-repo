<script lang="ts">
  import { filterByType } from "@tutors/tutors-model-lib";
  import type { Composite } from "@tutors/tutors-model-lib";
  import Panels from "../layout/Panels.svelte";
  import Units from "../layout/Units.svelte";
  import Cards from "../layout/Cards.svelte";
  import Image from "@tutors/ui-primitives/components/Image.svelte";
  import SecondaryNavigator from "@tutors/ui-navigators/SecondaryNavigator.svelte";
  import CalendarButton from "@tutors/ui-navigators/buttons/CalendarButton.svelte";
  import { rbacService } from "@tutors/rbac";
  import { currentCourse } from "@tutors/runes";
  import { t } from "@tutors/i18n";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  let { composite }: { composite: Composite } = $props();
  const visible = $derived((composite.type === "course" ? filterByType(composite.los, "topic") : (composite?.units?.standardLos ?? [])).filter(lo => rbacService.isLoVisibleToStudent(lo)));
  const firstTopic = $derived(visible.find(lo => lo.type === "topic"));
</script>
<SecondaryNavigator lo={composite} parentCourse={composite?.parentCourse?.properties?.parent} />
{#if composite}
  <div class="ui-page composite-page">
    <header class="composite-heading">
      <div><p class="ui-eyebrow">{composite.type === "course" ? t("shell.overview") : composite.type}</p><h1 class="ui-title">{composite.title}</h1><div class="ui-muted summary">{@html sanitizeHtml(composite.summary ?? "")}</div></div>
      <Image lo={composite} />
    </header>
    {#if firstTopic && composite.type === "course"}
      <div class="course-start">
        <section class="ui-panel start-panel">
          <Image lo={firstTopic} miniImage />
          <div><p class="ui-eyebrow">{t("shell.startHere")}</p><h2>{firstTopic.title}</h2><div class="ui-muted text-sm">{@html sanitizeHtml(firstTopic.summary ?? "")}</div></div>
          <a class="ui-button ui-button-primary" href={firstTopic.route}>{t("shell.openTopic")} →</a>
        </section>
        {#if currentCourse.value?.courseCalendar?.currentWeek}
          <section class="ui-panel"><p class="ui-eyebrow">{t("nav.calendar.label")}</p><h2>{currentCourse.value.courseCalendar.currentWeek.title}</h2><CalendarButton /></section>
        {/if}
      </div>
    {/if}
    <div class="composite-columns" class:with-sides={composite.units?.sides?.length > 0}>
      <div class="main-group">
        <Panels panels={composite.panels} />
        {#if visible.length}
          <div class="ui-section-heading"><h2>{composite.type === "course" ? t("shell.topics") : t("shell.resources")}</h2><span class="ui-muted text-sm">{visible.length} · {t("shell.authoredOrder")}</span></div>
        {/if}
        <Units units={composite.units.units} />
        <Cards los={composite.units.standardLos} />
      </div>
      {#if composite.units?.sides?.length}<aside class="side-groups"><Units units={composite.units.sides} /></aside>{/if}
    </div>
  </div>
{/if}
<style>
  .composite-page { padding-top: 0; }
  .composite-heading { display: flex; justify-content: space-between; align-items: center; gap: var(--space-6); }
  .composite-heading > div { min-width: 0; }
  h1 { margin-top: var(--space-2); }
  .summary { margin-top: var(--space-2); }
  .course-start { display: flex; gap: var(--space-5); margin-top: var(--space-6); }
  .start-panel { display: flex; align-items: center; flex: 1; gap: var(--space-5); background: var(--ui-selected); border-color: var(--ui-control-border); }
  .start-panel > div { flex: 1; min-width: 0; }
  h2 { font-size: var(--font-section); font-weight: var(--weight-semibold); }
  .composite-columns { margin-top: var(--space-6); }
  .main-group, .side-groups { min-width: 0; }
  .with-sides { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 30%); gap: var(--space-6); }
  @media (max-width: 1279px) { .course-start { flex-wrap: wrap; } .start-panel { flex-wrap: wrap; } }
  @media (max-width: 767px) { .with-sides { grid-template-columns: minmax(0, 1fr); } .composite-heading > :global(.lo-artwork) { display: none; } .course-start > section { width: 100%; } .start-panel > a { width: 100%; } }
</style>
