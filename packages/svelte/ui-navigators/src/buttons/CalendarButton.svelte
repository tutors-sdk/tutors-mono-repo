<script lang="ts">
  import Calendar from "../Calendar.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { currentCourse } from "@tutors/runes";
  import { t } from "@tutors/i18n";
  let { labelled = false } = $props();

  const weekTitle = $derived(currentCourse?.value?.courseCalendar?.currentWeek?.title);
  const heading = $derived(labelled || !weekTitle ? t("shell.calendar") : weekTitle);
  const thisWeek = $derived(labelled && weekTitle ? `${t("shell.thisWeek")} · ${weekTitle}` : "");
  // WCAG 2.5.3: the button is labelled by the week it shows, so the tip is added to that text
  // rather than put in its place. A name that drops the visible words leaves someone driving the
  // page by voice with nothing to say, and axe fails the course page for it.
  const triggerLabel = $derived(`${heading}${thisWeek ? ` ${thisWeek}` : ""}, ${t("nav.calendar.tip")}`);
</script>

{#if currentCourse?.value?.courseCalendar}
  {#snippet menuSelector()}
    <span data-tour="calendar" class={labelled ? "nav-row" : "ui-button"}>
      <Icon type="calendar" />
      <span class="calendar-label">
        <span>{heading}</span>
        {#if thisWeek}<span class="calendar-week">{thisWeek}</span>{/if}
      </span>
    </span>
  {/snippet}

  {#snippet sidebarContent()}
    <Calendar calendar={currentCourse.value?.courseCalendar!} />
  {/snippet}

  <Sidebar presentation="dialog" {menuSelector} {sidebarContent} width="w-5xl" ariaLabel={triggerLabel} eyebrow={t("shell.calendar")} title={`${currentCourse.value.courseCalendar.title}${currentCourse.value.courseCalendar.year ? ` · ${currentCourse.value.courseCalendar.year}` : ""}`} description={t("shell.calendarDescription")} />
{/if}

<style>
  .nav-row > :global(svg) { align-self: flex-start; }
  .calendar-label { display: grid; min-width: 0; gap: 2px; text-align: left; }
  .calendar-week { font-size: var(--font-caption); line-height: var(--leading-ui); color: var(--ui-muted); overflow-wrap: anywhere; }
</style>
