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
      <span>{labelled ? t("shell.calendar") : (currentCourse.value?.courseCalendar?.currentWeek?.title ?? t("shell.calendar"))}</span>
    </span>
  {/snippet}

  {#snippet sidebarContent()}
    <Calendar calendar={currentCourse.value?.courseCalendar!} />
  {/snippet}

  <Sidebar presentation="dialog" {menuSelector} {sidebarContent} width="w-5xl" ariaLabel={t("nav.calendar.tip")} eyebrow={t("shell.calendar")} title={`${currentCourse.value.courseCalendar.title}${currentCourse.value.courseCalendar.year ? ` · ${currentCourse.value.courseCalendar.year}` : ""}`} description={t("shell.calendarDescription")} />
{/if}
