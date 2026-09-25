<script lang="ts">
  import Calendar from "../Calendar.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { currentCourse } from "@tutors/runes";
  import { t } from "@tutors/i18n";
  /** `chip`: a quiet one-line "Current Week · <title>" for the course header, rather than a full button. */
  let { labelled = false, chip = false } = $props();
</script>

{#if currentCourse?.value?.courseCalendar}
  {#snippet menuSelector()}
    {#if chip}
      <span class="calendar-chip">
        <Icon type="calendar" height="16" />
        <span class="chip-label">{t("nav.calendar.label")}</span>
        <span class="chip-week">{currentCourse.value?.courseCalendar?.currentWeek?.title}</span>
      </span>
    {:else}
    <span data-tour="calendar" class={labelled ? "nav-row" : "ui-button"}>
      <Icon type="calendar" />
      <span>{labelled ? t("shell.calendar") : (currentCourse.value?.courseCalendar?.currentWeek?.title ?? t("shell.calendar"))}</span>
    </span>
    {/if}
  {/snippet}

  {#snippet sidebarContent()}
    <Calendar calendar={currentCourse.value?.courseCalendar!} />
  {/snippet}

  <Sidebar presentation="dialog" {menuSelector} {sidebarContent} width="w-5xl" ariaLabel={t("nav.calendar.tip")} eyebrow={t("shell.calendar")} title={`${currentCourse.value.courseCalendar.title}${currentCourse.value.courseCalendar.year ? ` · ${currentCourse.value.courseCalendar.year}` : ""}`} description={t("shell.calendarDescription")} />
{/if}

<style>
  .calendar-chip { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 32px; padding: var(--space-1) var(--space-3); border: 1px solid var(--ui-border); border-radius: 999px; background: var(--ui-surface); color: var(--ui-ink); font-size: var(--font-label); }
  .calendar-chip:hover { background: var(--ui-selected); }
  .chip-label { color: var(--ui-muted); }
  .chip-label::after { content: "·"; margin-left: var(--space-2); }
  .chip-week { font-weight: var(--weight-medium); }
</style>
