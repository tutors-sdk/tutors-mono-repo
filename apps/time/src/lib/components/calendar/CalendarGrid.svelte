<script lang="ts">
  import { createGrid, ModuleRegistry, AllCommunityModule } from "ag-grid-community";
  import type { ColDef, GridApi } from "ag-grid-community";
  import { GridCalendarModel } from "$lib/components/calendar/GridCalendarModel";
  import type { CalendarRow, CalendarMedianRow, TutorsTimeCourse } from "@tutors/tutors-time-lib";

  ModuleRegistry.registerModules([AllCommunityModule]);

  type Mode = "day" | "week";
  type Variant = "detail" | "summary";
  type GridRow = CalendarRow | CalendarMedianRow;

  interface Props {
    course: TutorsTimeCourse | null;
    mode: Mode;
    variant?: Variant;
    /** When true, append the median row to the grid (student view: show student + course median in same grid). */
    includeMedianRow?: boolean;
    /** When set with includeMedianRow, filter rows to only this student (so median is course-level, not single-student). */
    studentId?: string | null;
  }

  let { course, mode, variant = "detail", includeMedianRow = false, studentId = null }: Props = $props();

  const model = $derived(
    course?.calendarModel ? new GridCalendarModel(course.calendarModel) : null
  );
  const title = $derived(mode === "week" ? "Calendar by week" : "Calendar by day");
  const courseError = $derived(course?.error ?? null);

  const isSummary = $derived(variant === "summary");

  const baseColumnDefs = $derived(
    !model
      ? []
      : isSummary
        ? mode === "day"
          ? model.medianByDay.columnDefs
          : model.medianByWeek.columnDefs
        : mode === "day"
          ? model.day.columnDefs
          : model.week.columnDefs
  );

  /** Strip sort from columns when includeMedianRow so blank row stays between student and median. */
  const columnDefs = $derived(
    includeMedianRow && mode === "week"
      ? baseColumnDefs.map((col) => ({ ...col, sort: undefined } as typeof col))
      : baseColumnDefs
  );

  const rowData = $derived(
    !model
      ? []
      : isSummary
        ? (() => {
            const row = mode === "day" ? model.medianByDay.row : model.medianByWeek.row;
            return row ? [row] : [];
          })()
        : (() => {
            let rows = mode === "day" ? model.day.rows : model.week.rows;
            if (studentId != null && studentId !== "") {
              rows = rows.filter((r) => (r as CalendarRow).studentid === studentId);
            }
            if (!includeMedianRow || mode !== "week") return rows;
            const medianRow = model.medianByWeek.row;
            if (!medianRow) return rows;
            const blankRow: CalendarRow = {
              courseid: "",
              studentid: "",
              full_name: "",
              totalSeconds: 0,
              online_status: "",
              sentiment: "",
              avatar_url: ""
            };
            const combined: CalendarRow = {
              ...medianRow,
              studentid: "",
              full_name: "Course median",
              online_status: "",
              sentiment: "",
              avatar_url: ""
            };
            return [...rows, blankRow, combined];
          })()
  );

  const hasData = $derived(
    !model
      ? false
      : isSummary
        ? mode === "day"
          ? model.medianByDay.row != null
          : model.medianByWeek.row != null
        : model.day.rows.length > 0
  );

  const ariaLabel = $derived(
    isSummary
      ? mode === "day"
        ? "Course median by day"
        : "Course median by week"
      : mode === "day"
        ? "Course usage by student and day"
        : "Course usage by student and week"
  );

  let gridContainer = $state<HTMLDivElement | null>(null);
  let gridApi = $state<GridApi<GridRow> | null>(null);

  $effect(() => {
    const container = gridContainer;
    if (!container || !model) return;
    const api = createGrid<GridRow>(container, {
      theme: "legacy",
      columnDefs: columnDefs as ColDef<GridRow>[],
      rowData,
      loading: course?.loading ?? false,
      defaultColDef: { sortable: true, resizable: true },
      domLayout: "normal",
      suppressNoRowsOverlay: false,
      headerHeight: 72,
      rowHeight: 36,
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
      api.setGridOption("columnDefs", columnDefs as ColDef<GridRow>[]);
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
          <p class="text-lg text-surface-600">No calendar data found for this course.</p>
        </div>
      {:else}
        <div class="flex-1 min-h-0 flex flex-col">
          <div class="flex-1 min-h-0">
            {#if model?.error}
              <div class="card preset-filled-error-500 p-4">
                <p class="font-bold">Error loading data</p>
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
