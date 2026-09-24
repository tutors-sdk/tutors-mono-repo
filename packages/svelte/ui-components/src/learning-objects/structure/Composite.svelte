<script lang="ts">
  import { filterByType } from "@tutors/tutors-model-lib";
  import type { Composite } from "@tutors/tutors-model-lib";
  import Panels from "../layout/Panels.svelte";
  import Units, { hasVisibleLos } from "../layout/Units.svelte";
  import Cards from "../layout/Cards.svelte";
  import Image from "@tutors/ui-primitives/components/Image.svelte";
  import SecondaryNavigator from "@tutors/ui-navigators/SecondaryNavigator.svelte";
  import CalendarButton from "@tutors/ui-navigators/buttons/CalendarButton.svelte";
  import { currentCourse } from "@tutors/runes";
  import { t } from "@tutors/i18n";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  let { composite }: { composite: Composite } = $props();
  // Side units the viewer can see: when a student can see none (all hidden or locked), no side column is reserved.
  const sides = $derived((composite?.units?.sides ?? []).filter(hasVisibleLos));
  // What the cards show: everything not hidden, locked resources included (greyed out).
  const visible = $derived((composite.type === "course" ? filterByType(composite.los, "topic") : (composite?.units?.standardLos ?? [])).filter(lo => !lo.hide));

  /**
   * Sizes the two regions of a topic with side units. The side column holds a single column of cards and
   * is never wider than one (plus --side-slack), so every other spare pixel in the row goes to the main
   * group. Below the width that still leaves room for a card beside it the two stack. Off a with-sides
   * page there is nothing to do.
   */
  function layoutCards(node: HTMLElement) {
    // Units are panels (Units.svelte), so their padding and border are width the cards inside cannot
    // use. Measured rather than assumed, and only for a region that actually holds one.
    const insetOf = (region: string) => {
      const panel = node.querySelector(`${region} .unit-panel`);
      if (!panel) return 0;
      const style = getComputedStyle(panel);
      return ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"].reduce((total, edge) => total + parseFloat(style[edge as never]), 0);
    };
    const measure = () => {
      if (node.classList.contains("with-sides")) {
        const style = getComputedStyle(node);
        // Tuned in paper-tokens.css, declared in px so a bare parse is enough.
        const cardWidth = parseFloat(style.getPropertyValue("--card-width")) || 200;
        const sideWidth = cardWidth + insetOf(".side-groups") + (parseFloat(style.getPropertyValue("--side-slack")) || 0);
        // The spacer track between the groups plus the gap either side of it.
        const between = parseFloat(style.getPropertyValue("--space-6")) + 2 * (parseFloat(style.columnGap) || 0);
        node.style.setProperty("--side-width", `${sideWidth}px`);
        node.dataset.stacked = String(node.clientWidth - sideWidth - between - insetOf(".main-group") < cardWidth);
      }
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
    {#if composite.type === "course" && currentCourse.value?.courseCalendar?.currentWeek}
      <div class="course-start">
        <section class="ui-panel"><p class="ui-eyebrow">{t("nav.calendar.label")}</p><h2>{currentCourse.value.courseCalendar.currentWeek.title}</h2><CalendarButton /></section>
      </div>
    {/if}
    <div class="composite-columns" class:with-sides={sides.length > 0} use:layoutCards>
      <div class="main-group">
        <Panels panels={composite.panels} />
        {#if visible.length}
          <div class="ui-section-heading"><h2>{composite.type === "course" ? t("shell.topics") : t("shell.resources")}</h2><span class="ui-muted text-sm">{visible.length} · {t("shell.authoredOrder")}</span></div>
        {/if}
        <Units units={composite.units.units} />
        <Cards los={composite.units.standardLos} />
      </div>
      {#if sides.length}<aside class="side-groups"><Units units={sides} /></aside>{/if}
    </div>
  </div>
{/if}
<style>
  .composite-page { padding-top: 0; container-type: inline-size; }
  .composite-heading { display: flex; justify-content: space-between; align-items: center; gap: var(--space-6); }
  .composite-heading > div { min-width: 0; }
  h1 { margin-top: var(--space-2); }
  .summary { margin-top: var(--space-2); }
  /* Holds the current-week callout on a course page. A flex row rather than a bare section because the
     row used to carry a "start here" panel beside it; keeping it means a second callout can go back in. */
  .course-start { display: flex; gap: var(--space-5); margin-top: var(--space-6); }
  h2 { font-size: var(--font-section); font-weight: var(--weight-semibold); }
  .composite-columns { margin-top: var(--space-6); }
  .main-group, .side-groups { min-width: 0; }
  /* The side column is pinned to one card's width (--side-width, set by layoutCards from --card-width plus
     the unit panel's padding and border) and never grows; the main group takes the rest, with a 24px spacer
     track between them. The card grids inside wrap and centre their own cards. */
  .with-sides { --side-width: auto; display: grid; grid-template-columns: minmax(0, 1fr) var(--space-6) var(--side-width); gap: var(--space-4); }
  .with-sides > .main-group { grid-column: 1; }
  .with-sides > .side-groups { grid-column: 3; }
  .with-sides:global([data-stacked="true"]) { grid-template-columns: minmax(0, 1fr); }
  .with-sides:global([data-stacked="true"]) > :is(.main-group, .side-groups) { grid-column: auto; }
  @media (max-width: 1279px) { .course-start { flex-wrap: wrap; } }
  @media (max-width: 767px) { .composite-heading > :global(.lo-artwork) { display: none; } .course-start > section { width: 100%; } }
</style>
