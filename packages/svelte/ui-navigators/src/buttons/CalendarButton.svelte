<script lang="ts">
  import Calendar from "../Calendar.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { currentCourse } from "@tutors/runes";
  import { t } from "@tutors/i18n";
</script>

{#if currentCourse?.value?.courseCalendar}
  {#snippet menuSelector()}
    <div data-tour="calendar" class="hidden w-full lg:flex">
      <button class="hover:preset-tonal mx-auto inline-flex rounded-lg p-2">
        <span class="my-auto pr-4 pl-2">
          <Icon tip={t("nav.calendar.tip")} type="calendar" />
        </span>
        <span class="mx-2 h-10 w-[1px]" style="background-color: light-dark(rgb(156, 163, 175), rgb(229, 231, 235));"></span>
        <span class="px-2">
          <span class="pt-1 text-sm">{t("nav.calendar.label")}</span><br />
          <span class="pb-1 text-lg font-bold">{currentCourse.value?.courseCalendar?.currentWeek?.title ?? currentCourse.value?.courseCalendar?.title}</span>
        </span>
      </button>
    </div>
  {/snippet}

  {#snippet sidebarContent()}
    <Calendar calendar={currentCourse.value?.courseCalendar!} />
  {/snippet}

  <Sidebar {menuSelector} {sidebarContent} width="w-2xl" ariaLabel={t("nav.calendar.tip")} />
{/if}
