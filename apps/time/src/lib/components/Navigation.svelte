<script lang="ts">
  import { Portal, Tooltip } from "@skeletonlabs/skeleton-svelte";
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

<nav
  class="w-24 shrink-0 self-start m-2 rounded-xl border border-surface-300 bg-surface-100 px-4 py-4 flex flex-col items-center gap-1"
  role="navigation"
  aria-label="Course navigation"
>
  {#each navLinks as item (item.href)}
    <Tooltip positioning={{ placement: "right" }}>
      <Tooltip.Trigger class="w-full flex justify-center">
        <a
          href={item.href}
          class="btn btn-icon btn-icon-lg preset-tonal flex items-center justify-center aspect-square size-10 shrink-0"
        >
          <Icon icon={item.icon} class="size-8 shrink-0" />
        </a>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner class="z-20!">
          <Tooltip.Content class="card p-2 preset-filled-surface-950-50">
            <span>{item.label}</span>
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip>
  {/each}
</nav>
