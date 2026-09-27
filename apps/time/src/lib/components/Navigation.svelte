<script lang="ts">
  import { page } from "$app/state";
  import Icon from "@iconify/svelte";

  interface Props {
    courseId: string;
  }

  let { courseId }: Props = $props();

  const calendarPath = $derived(`/${courseId}/calendar`);
  const labPath = $derived(`/${courseId}/lab`);

  const navLinks = $derived([
    {
      label: "Medians",
      href: `/${courseId}/medians`,
      icon: "carbon:chart-median"
    },
    {
      label: "Calendar by Week",
      href: `${calendarPath}/byweek`,
      icon: "streamline-ultimate-color:calendar-1"
    },
    {
      label: "Calendar By Day",
      href: `${calendarPath}/byday`,
      icon: "streamline-ultimate-color:calendar-date"
    },
    {
      label: "Labs by Lab",
      href: `${labPath}/bylab`,
      icon: "game-icons:test-tubes"
    },
    {
      label: "Labs by Step",
      href: `${labPath}/bystep`,
      icon: "streamline-ultimate-color:lab-tube-experiment"
    },
    {
      label: "Raw Calendar",
      href: `${calendarPath}/raw`,
      icon: "glyphs-poly:grid-sm"
    },
    {
      label: "Learning Records",
      href: `${labPath}/learning-records`,
      icon: "glyphs-poly:grid-1"
    },
    {
      label: "Assignments",
      href: `/${courseId}/assignments`,
      icon: "streamline-ultimate-color:task-list-pen"
    }
  ]);
</script>

{#snippet links()}
  <nav aria-label="Course navigation">
    {#each navLinks as item (item.href)}
      <a href={item.href} aria-current={page.url.pathname === item.href ? "page" : undefined}><Icon icon={item.icon} width="24" /><span>{item.label}</span></a>
    {/each}
  </nav>
{/snippet}
<aside class="time-navigation">{@render links()}</aside>
<details class="mobile-navigation"><summary>Course navigation</summary>{@render links()}</details>
<style>
  .time-navigation { width: 248px; flex-shrink: 0; padding: var(--space-5) var(--space-4); background: var(--ui-surface); border-right: 1px solid var(--ui-border); overflow-y: auto; }
  nav { display: grid; gap: var(--space-2); }
  a { display: flex; align-items: center; gap: var(--space-3); min-height: 44px; padding: var(--space-3); color: var(--ui-ink); border-radius: var(--radius-control); font-size: var(--font-label); }
  a:hover, a[aria-current] { background: var(--ui-selected); }
  a[aria-current] { box-shadow: inset 3px 0 var(--ui-brand); font-weight: var(--weight-semibold); }
  .mobile-navigation { display: none; background: var(--ui-surface); padding: var(--space-3); border-bottom: 1px solid var(--ui-border); }
  summary { cursor: pointer; padding: var(--space-3); }
  @media (max-width: 1023px) { .time-navigation { display: none; } .mobile-navigation { display: block; } }
</style>
