<script lang="ts">
  import { page } from "$app/state";
  import { t, type MessageKey } from "@tutors/i18n";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import CourseNavigation from "@tutors/ui-navigators/CourseNavigation.svelte";

  interface Props {
    courseId: string;
  }

  let { courseId }: Props = $props();

  const navLinks: { label: MessageKey; path: string; icon: string }[] = [
    { label: "classTime.medians", path: "medians", icon: "lucide:chart-no-axes-column" },
    { label: "classTime.calendarByWeek", path: "calendar/byweek", icon: "lucide:calendar-range" },
    { label: "classTime.calendarByDay", path: "calendar/byday", icon: "lucide:calendar-days" },
    { label: "classTime.labsByLab", path: "lab/bylab", icon: "lucide:flask-conical" },
    { label: "classTime.labsByStep", path: "lab/bystep", icon: "lucide:list-ordered" },
    { label: "classTime.rawCalendar", path: "calendar/raw", icon: "lucide:table" },
    { label: "classTime.learningRecords", path: "lab/learning-records", icon: "lucide:notebook-tabs" },
    { label: "classTime.assignments", path: "assignments", icon: "lucide:clipboard-list" }
  ];
</script>

{#if !courseId}
  <CourseNavigation showConnect={false} />
{:else}
<nav class="time-navigation" aria-label={t("shell.classActivity")}>
  <p class="nav-section">{t("shell.classActivity")}</p>
  {#each navLinks as item (item.path)}
    {@const href = `/${courseId}/${item.path}`}
    <a class="nav-row" {href} aria-current={page.url.pathname === href ? "page" : undefined}><Icon icon={item.icon} height="24" /><span>{t(item.label)}</span></a>
  {/each}
  <p class="nav-section">{t("classTime.course")}</p>
  <a class="nav-row" href="/"><Icon icon="lucide:arrow-left-right" height="24" /><span>{t("classTime.changeCourse")}</span></a>
</nav>
{/if}

<style>
  .time-navigation { display: flex; flex-direction: column; gap: var(--space-1); height: 100%; overflow-y: auto; overscroll-behavior: contain; padding: var(--space-6) var(--space-4); font-size: var(--font-label); line-height: var(--leading-ui); }
  .nav-section { margin: var(--space-6) var(--space-3) var(--space-2); color: var(--ui-muted); text-transform: var(--ui-label-transform); letter-spacing: var(--ui-label-spacing); font-size: var(--font-small); font-weight: var(--weight-semibold); }
  .nav-section:first-child { margin-top: 0; }
  .nav-row { display: flex; flex-shrink: 0; align-items: center; gap: var(--space-3); min-height: 44px; padding: var(--space-3); border-radius: var(--radius-control); color: var(--ui-ink); text-decoration: none; }
  .nav-row:hover, .nav-row[aria-current] { background: var(--ui-selected); }
  .nav-row[aria-current] { box-shadow: inset 3px 0 var(--ui-brand); font-weight: var(--weight-semibold); }
  .nav-row :global(svg) { flex-shrink: 0; }
</style>
