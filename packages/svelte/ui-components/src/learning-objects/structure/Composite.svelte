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

  /**
   * Lays out cards across unit and side grids: every card takes the height of the tallest one, and beside side
   * units the page is split into equal columns (220px minimum). Main units take the columns they can fill, side
   * units the rest; when both have fewer cards than columns, the columns widen so the page stays full.
   */
  function layoutCards(node: HTMLElement) {
    const measure = () => {
      if (node.classList.contains("with-sides")) {
        // 40px = the 24px spacer track between main and side plus its extra 16px gap.
        const available = Math.max(1, Math.min(6, Math.floor((node.clientWidth - 40 + 16) / (220 + 16))));
        const most = (selector: string) => Math.max(1, ...[...node.querySelectorAll(selector)].map(grid => grid.children.length));
        // Embedded players (podcasts, videos) need two columns of width to play without scrolling.
        const sideMin = available >= 4 && node.querySelector(".side-groups iframe") ? 2 : 1;
        const main = available === 1 ? 1 : Math.min(available - sideMin, most(".main-group .card-grid"));
        const side = available === 1 ? 1 : Math.min(available - main, Math.max(sideMin, most(".side-groups .card-grid")));
        node.dataset.stacked = String(available === 1);
        node.style.setProperty("--main-columns", String(main));
        node.style.setProperty("--side-columns", String(side));
      }
      node.style.removeProperty("--card-height");
      const tallest = Math.max(0, ...[...node.querySelectorAll<HTMLElement>(".resource-card")].map(card => card.offsetHeight));
      if (tallest) node.style.setProperty("--card-height", `${tallest}px`);
    };
    const schedule = () => requestAnimationFrame(measure);
    const resized = new ResizeObserver(schedule);
    const changed = new MutationObserver(schedule);
    resized.observe(node);
    changed.observe(node, { childList: true, subtree: true });
    return { destroy() { resized.disconnect(); changed.disconnect(); } };
  }
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
    <div class="composite-columns" class:with-sides={composite.units?.sides?.length > 0} use:layoutCards>
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
  .composite-page { padding-top: 0; container-type: inline-size; }
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
  /* Main and side units share one set of equal, flexible columns (220px minimum, 16px gaps, like the card grid),
     with a 24px spacer track between the groups; every card is the same size. */
  .with-sides { --main-columns: 1; --side-columns: 1; display: grid; grid-template-columns: repeat(var(--main-columns), minmax(0, 1fr)) var(--space-6) repeat(var(--side-columns), minmax(0, 1fr)); gap: var(--space-4); }
  .with-sides > .main-group { grid-column: 1 / span var(--main-columns); }
  .with-sides > .main-group :global(.ui-grid.card-grid) { grid-template-columns: repeat(var(--main-columns), minmax(0, 1fr)); }
  .with-sides > .side-groups { grid-column: span var(--side-columns) / -1; }
  .with-sides > .side-groups :global(.ui-grid.card-grid) { grid-template-columns: repeat(var(--side-columns, 1), minmax(0, 1fr)); }
  .with-sides:global([data-stacked="true"]) { grid-template-columns: minmax(0, 1fr); }
  .with-sides:global([data-stacked="true"]) > :is(.main-group, .side-groups) { grid-column: auto; }
  @media (max-width: 1279px) { .course-start { flex-wrap: wrap; } .start-panel { flex-wrap: wrap; } }
  @media (max-width: 767px) { .composite-heading > :global(.lo-artwork) { display: none; } .course-start > section { width: 100%; } .start-panel > a { width: 100%; } }
</style>
