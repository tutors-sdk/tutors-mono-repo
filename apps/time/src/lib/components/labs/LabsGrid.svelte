<script lang="ts">
  import { createGrid, ModuleRegistry, AllCommunityModule } from "ag-grid-community";
  import type { GridApi } from "ag-grid-community";
  import { GridLabModel } from "$lib/components/labs/GridLabModel";
  import type { LabRow, LabMedianRow, LabViewMode, TutorsTimeCourse } from "@tutors/tutors-time-lib";

  ModuleRegistry.registerModules([AllCommunityModule]);

  interface Props {
    course: TutorsTimeCourse | null;
    mode: LabViewMode;
    /** Optional: limit rows to a single student id (matches LabRow.studentid). */
    studentId?: string | null;
    /** When true and mode is "lab", append the course median row (student view: show student + course median in same grid). */
    includeMedianRow?: boolean;
  }

  let { course, mode, studentId = null, includeMedianRow = false }: Props = $props();

  const gridModel = $derived(course?.labsModel ? new GridLabModel(course.labsModel) : null);
  const title = $derived(mode === "lab" ? "Labs by lab" : "Labs by step");
  const courseError = $derived(course?.error ?? null);

  let gridContainer = $state<HTMLDivElement | null>(null);
  let gridApi = $state<GridApi<LabRow> | null>(null);

  const view = $derived(!gridModel ? null : mode === "lab" ? gridModel.lab : gridModel.step);

  /** Strip sort from columns when includeMedianRow so blank row stays between student and median. */
  const columnDefs = $derived(
    !view
      ? []
      : includeMedianRow && mode === "lab"
        ? view.columnDefs.map((col) => ({ ...col, sort: undefined }))
        : view.columnDefs
  );
  const rows = $derived(
    (() => {
      if (!view || !gridModel) return [];
      let result = studentId ? view.rows.filter((row) => row.studentid === studentId) : view.rows;
      if (includeMedianRow && mode === "lab") {
        const medianRow = gridModel.medianByLab.row;
        if (medianRow) {
          const blankRow: LabRow = {
            studentid: "",
            full_name: "",
            totalMinutes: 0,
            online_status: "",
            sentiment: "",
            avatar_url: ""
          };
          const combined: LabRow = {
            ...medianRow,
            studentid: "Course median",
            full_name: "Course median",
            online_status: "",
            sentiment: "",
            avatar_url: ""
          };
          result = [...result, blankRow, combined];
        }
      }
      return result;
    })()
  );

  $effect(() => {
    const container = gridContainer;
    if (!container || !gridModel) return;
    const api = createGrid<LabRow>(container, {
      theme: "legacy",
      columnDefs,
      rowData: rows,
      loading: course?.loading ?? false,
      defaultColDef: { sortable: true, resizable: true },
      domLayout: "normal",
      suppressNoRowsOverlay: false,
      headerHeight: 170,
      rowHeight: 32,
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
    if (api && gridModel) {
      api.setGridOption("columnDefs", columnDefs);
      api.setGridOption("rowData", rows);
      api.setGridOption("loading", course?.loading ?? false);
    }
  });
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content="Course {title.toLowerCase()}" />
</svelte:head>

{#if !course}
  <p role="status">Loading lab data…</p>
{:else if courseError || gridModel?.error}
  <p class="ui-empty" role="alert">Error loading lab data: {courseError ?? gridModel?.error}</p>
{:else if !gridModel || gridModel.lab.rows.length === 0}
  <p class="ui-empty">No lab data found for this course.</p>
{:else}
  <div class="ag-theme-quartz time-grid" role="grid" aria-label="Lab duration by student">
    <div bind:this={gridContainer} class="grid-fill-container"></div>
  </div>
{/if}
