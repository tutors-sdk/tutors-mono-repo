<script lang="ts">
  import Calendar from "../Calendar.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { currentCourse } from "@tutors/runes";
  import { t } from "@tutors/i18n";
  let { labelled = false } = $props();
</script>

{#if currentCourse?.value?.courseCalendar}
  {#snippet menuSelector()}
    <span data-tour="calendar" class={labelled ? "nav-row" : "ui-button"}>
      <Icon type="calendar" />
      <span class="calendar-label">
        <span>{labelled ? t("shell.calendar") : (currentCourse.value.courseCalendar.currentWeek?.title ?? t("shell.calendar"))}</span>
        {#if labelled && currentCourse.value.courseCalendar.currentWeek}
          <span class="calendar-week">{t("shell.thisWeek")} · {currentCourse.value.courseCalendar.currentWeek.title}</span>
        {/if}
      </span>
    </span>
  {/snippet}

  {#snippet sidebarContent()}
    <Calendar calendar={currentCourse.value?.courseCalendar!} />
  {/snippet}

  <Sidebar presentation="dialog" {menuSelector} {sidebarContent} width="w-5xl" ariaLabel={t("nav.calendar.tip")} eyebrow={t("shell.calendar")} title={`${currentCourse.value.courseCalendar.title}${currentCourse.value.courseCalendar.year ? ` · ${currentCourse.value.courseCalendar.year}` : ""}`} description={t("shell.calendarDescription")} />
{/if}

<style>
  .nav-row > :global(svg) { align-self: flex-start; }
  .calendar-label { display: grid; min-width: 0; gap: 2px; text-align: left; }
  .calendar-week { font-size: var(--font-caption); line-height: var(--leading-ui); color: var(--ui-muted); overflow-wrap: anywhere; }
</style>
