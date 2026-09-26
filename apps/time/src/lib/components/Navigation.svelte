<script lang="ts">
  import { page } from "$app/state";
  import Icon from "@iconify/svelte";
  import CourseNavigation from "@tutors/ui-navigators/CourseNavigation.svelte";

  interface Props {
    courseId: string;
  }

  let { courseId }: Props = $props();

  const navLinks = $derived([
    { label: "Medians", href: `/${courseId}/medians`, icon: "lucide:chart-no-axes-column" },
    { label: "Calendar by week", href: `/${courseId}/calendar/byweek`, icon: "lucide:calendar-range" },
    { label: "Calendar by day", href: `/${courseId}/calendar/byday`, icon: "lucide:calendar-days" },
    { label: "Labs by lab", href: `/${courseId}/lab/bylab`, icon: "lucide:flask-conical" },
    { label: "Labs by step", href: `/${courseId}/lab/bystep`, icon: "lucide:list-ordered" },
    { label: "Raw calendar", href: `/${courseId}/calendar/raw`, icon: "lucide:table" },
    { label: "Learning records", href: `/${courseId}/lab/learning-records`, icon: "lucide:notebook-tabs" },
    { label: "Assignments", href: `/${courseId}/assignments`, icon: "lucide:clipboard-list" }
  ]);
</script>

{#if !courseId}
  <CourseNavigation showConnect={false} />
{:else}
<nav class="time-navigation" aria-label="Class activity">
  <p class="nav-section">Class activity</p>
  {#each navLinks as item (item.href)}
    <a class="nav-row" href={item.href} aria-current={page.url.pathname === item.href ? "page" : undefined}><Icon icon={item.icon} width="24" /><span>{item.label}</span></a>
  {/each}
  <p class="nav-section">Course</p>
  <a class="nav-row" href="/"><Icon icon="lucide:arrow-left-right" width="24" /><span>Change course</span></a>
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
