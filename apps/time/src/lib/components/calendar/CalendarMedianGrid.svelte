<script lang="ts">
  import { createGrid, ModuleRegistry, AllCommunityModule } from "ag-grid-community";
  import type { GridApi } from "ag-grid-community";
  import { GridCalendarModel } from "$lib/components/calendar/GridCalendarModel";
  import type { CalendarMedianRow, TutorsTimeCourse } from "@tutors/tutors-time-lib";

  ModuleRegistry.registerModules([AllCommunityModule]);

  type SummaryMode = "day" | "week";

  interface Props {
    course: TutorsTimeCourse | null;
    mode: SummaryMode;
  }

  let { course, mode }: Props = $props();

  const model = $derived(
    course?.calendarModel ? new GridCalendarModel(course.calendarModel) : null
  );
  const title = $derived(mode === "week" ? "Median by week" : "Median by day");
  const courseError = $derived(course?.error ?? null);

  const columnDefs = $derived(!model ? [] : mode === "day" ? model.medianByDay.columnDefs : model.medianByWeek.columnDefs);
  const row = $derived(!model ? null : mode === "day" ? model.medianByDay.row : model.medianByWeek.row);
  const rowData = $derived(row ? [row] : []);
  const hasData = $derived(
    !model ? false : mode === "day" ? model.medianByDay.row != null : model.medianByWeek.row != null
  );
  const ariaLabel = $derived(mode === "day" ? "Course median by day" : "Course median by week");

  let gridContainer = $state<HTMLDivElement | null>(null);
  let gridApi = $state<GridApi<CalendarMedianRow> | null>(null);

  $effect(() => {
    const container = gridContainer;
    if (!container || !model) return;
    const api = createGrid<CalendarMedianRow>(container, {
      theme: "legacy",
      columnDefs,
      rowData,
      loading: course?.loading ?? false,
      defaultColDef: { sortable: true, resizable: true },
      domLayout: "normal",
      suppressNoRowsOverlay: false,
      headerHeight: 72,
      enableCellTextSelection: true,
      ensureDomOrder: true
    });
    gridApi = api;
    return () => {
      api.destroy();
      gridApi = null;
    };
  });

  $effect(() => {
    const api = gridApi;
    if (api && model) {
      api.setGridOption("columnDefs", columnDefs);
      api.setGridOption("rowData", rowData);
      api.setGridOption("loading", course?.loading ?? false);
    }
  });
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content="Course {title.toLowerCase()}" />
</svelte:head>

<section class="p-2 h-[calc(100vh-4rem)]">
  <div class="card p-4 h-full flex flex-col">
    <div class="flex flex-col flex-1 min-h-0">
      {#if !course}
        <div class="flex items-center justify-center flex-1">
          <p class="text-lg">Loading calendar data...</p>
        </div>
      {:else if courseError}
        <div class="card preset-filled-error-500 p-4">
          <p class="font-bold">Error loading calendar</p>
          <p class="text-sm">{courseError}</p>
        </div>
      {:else if !hasData}
        <div class="flex items-center justify-center flex-1">
          <p class="text-lg text-surface-600">No median data found for this course.</p>
        </div>
      {:else}
        <div class="flex-1 min-h-0 flex flex-col">
          <div class="flex-1 min-h-0">
            {#if model?.error}
              <div class="card preset-filled-error-500 p-4">
                <p class="font-bold">Error loading summary</p>
                <p class="text-sm">{model.error}</p>
              </div>
            {:else}
              <div class="ag-theme-quartz grid-fill-container h-full min-h-0" role="grid" aria-label={ariaLabel}>
                <div bind:this={gridContainer} class="grid-fill-container"></div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
</section>
