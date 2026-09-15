import type { ColDef, ICellRendererParams } from "ag-grid-community";
import type { LabModel, LabRow, LabMedianRow } from "@tutors/tutors-time-lib";
import {
  cellColorForMinutes,
  formatTimeMinutesOnly,
  formatDateShort,
  extractLabIdentifier,
  extractStepName
} from "@tutors/tutors-time-lib";
import { OnlineCellRenderer } from "$lib/components/calendar/OnlineCellRenderer";
import { SentimentCellRenderer } from "$lib/components/calendar/SentimentCellRenderer";
import { StudentAvatarCellRenderer } from "$lib/components/calendar/StudentAvatarCellRenderer";

/** Header mode: "lab" = book segment, "step" = step name (last segment), "raw" = full id. */
type LabColumnHeaderMode = "lab" | "step" | "raw";

const NO_DATE_KEY = "__no_date__";

/** Grid-ready lab table with ColDef-typed columns for ag-grid. */
export type GridLabTable = {
  rows: LabRow[];
  columnDefs: ColDef<LabRow>[];
};

/** Grid-ready labs median table with ColDef-typed columns for ag-grid. */
export type GridLabMedianTable = {
  row: LabMedianRow | null;
  columnDefs: ColDef<LabMedianRow>[];
};

/**
 * Lab model with ColDef-typed columnDefs for use with ag-grid.
 * Wraps LabModel and builds column definitions at the grid boundary.
 */
export class GridLabModel {
  readonly lab: GridLabTable;
  readonly step: GridLabTable;
  readonly medianByLabStep: GridLabMedianTable;
  readonly medianByLab: GridLabMedianTable;
  readonly error: string | null;

  constructor(model: LabModel) {
    this.error = model.error;
    this.lab = {
      rows: model.lab.rows,
      columnDefs: this.buildLabColumnDefs(model)
    };
    this.step = {
      rows: model.step.rows,
      columnDefs: this.buildStepColumnDefs(model)
    };
    this.medianByLabStep = {
      row: model.medianByLabStep.row,
      columnDefs: this.buildMedianByLabStepColumnDefs(model)
    };
    this.medianByLab = {
      row: model.medianByLab.row,
      columnDefs: this.buildMedianByLabColumnDefs(model)
    };
  }

  private buildTotalMinutesColumn<T>(field: string = "totalMinutes", headerName = "Total"): ColDef<T> {
    return {
      field: field as never,
      headerName,
      headerClass: "ag-header-vertical",
      sort: "desc",
      valueFormatter: (p) =>
        p.value != null && Number(p.value) > 0 ? String(Math.round(Number(p.value))) : "",
      cellClass: "ag-right-aligned-cell",
      cellStyle: (p) => ({
        backgroundColor: cellColorForMinutes(p.value as number),
        paddingLeft: "4px"
      }),
      width: 60,
      maxWidth: 72
    };
  }

  private buildLabColumns<T>(
    labIds: string[],
    headerMode: LabColumnHeaderMode | boolean = false
  ): ColDef<T>[] {
    const mode: LabColumnHeaderMode =
      headerMode === true ? "lab" : headerMode === false ? "raw" : headerMode;
    return labIds.map((labId) => {
      const headerName =
        mode === "lab" ? extractLabIdentifier(labId) : mode === "step" ? extractStepName(labId) : labId;
      const headerTooltip = mode === "step" && labId !== headerName ? labId : undefined;
      return {
        field: labId as never,
        headerName,
        headerTooltip,
        headerClass: "ag-header-vertical",
        valueFormatter: (p) =>
          p.value != null && Number(p.value) > 0 ? formatTimeMinutesOnly(Number(p.value)) : "",
        cellClass: "ag-right-aligned-cell",
        cellStyle: (p) => ({
          backgroundColor: cellColorForMinutes(p.value as number),
          textAlign: "center",
          paddingLeft: "4px"
        }),
        width: 48,
        maxWidth: 72
      };
    }) as ColDef<T>[];
  }

  private buildStudentColumns(courseId: string): ColDef<LabRow>[] {
    return [
      {
        field: "full_name",
        headerName: "Name",
        minWidth: 160,
        flex: 1,
        pinned: "left",
        cellStyle: { paddingLeft: "4px" },
        cellRenderer: (params: ICellRendererParams<LabRow>) => {
          const name = String(params.value ?? "");
          const studentId = String(params.data?.studentid ?? "");
          if (!studentId || !courseId) return name;
          return `<a href="/${courseId}/${studentId}" class="underline text-primary-600">${name}</a>`;
        }
      },
      {
        colId: "avatar",
        field: "avatar_url",
        headerName: "",
        minWidth: 40,
        maxWidth: 48,
        width: 44,
        pinned: "left",
        sortable: false,
        suppressHeaderMenuButton: true,
        cellStyle: { paddingLeft: "4px", paddingRight: "4px" },
        cellRenderer: StudentAvatarCellRenderer
      },
      {
        field: "online_status",
        headerName: "Share",
        headerClass: "ag-header-vertical",
        minWidth: 44,
        maxWidth: 56,
        width: 52,
        pinned: "left",
        cellStyle: { paddingLeft: "2px", paddingRight: "2px" },
        cellRenderer: OnlineCellRenderer
      },
      {
        colId: "sentiment",
        field: "sentiment",
        headerName: "Mood",
        headerClass: "ag-header-vertical",
        minWidth: 44,
        maxWidth: 56,
        width: 52,
        pinned: "left",
        sortable: false,
        suppressHeaderMenuButton: true,
        cellStyle: { paddingLeft: "2px", paddingRight: "2px" },
        cellRenderer: SentimentCellRenderer
      },
      {
        field: "studentid",
        headerName: "Github",
        minWidth: 120,
        maxWidth: 112,
        width: 96,
        pinned: "left",
        cellStyle: { paddingLeft: "4px" },
        cellRenderer: (params: ICellRendererParams<LabRow>) => {
          const studentId = String(params.value ?? "");
          if (!studentId || studentId === "Course median") return studentId === "Course median" ? "—" : studentId;
          return `<a href="https://github.com/${studentId}" target="_blank" rel="noopener noreferrer" class="underline text-primary-600">${studentId}</a>`;
        }
      }
    ];
  }

  private buildLabColumnDefs(model: LabModel): ColDef<LabRow>[] {
    return [
      ...this.buildStudentColumns(model.courseId),
      this.buildTotalMinutesColumn<LabRow>("totalMinutes", "Total"),
      ...this.buildLabColumns<LabRow>(model.labs, false)
    ];
  }

  private buildStepColumnDefs(model: LabModel): ColDef<LabRow>[] {
    return [
      ...this.buildStudentColumns(model.courseId),
      this.buildTotalMinutesColumn<LabRow>("totalMinutes", "Total"),
      ...this.buildLabColumns<LabRow>(model.steps, "step")
    ];
  }

  private buildMedianByLabStepColumnDefs(model: LabModel): ColDef<LabMedianRow>[] {
    return [
      this.buildTotalMinutesColumn<LabMedianRow>("totalMinutes", "Total"),
      ...this.buildLabColumns<LabMedianRow>(model.steps, "step")
    ];
  }

  private buildMedianByLabColumnDefs(model: LabModel): ColDef<LabMedianRow>[] {
    return [
      this.buildTotalMinutesColumn<LabMedianRow>("totalMinutes", "Total"),
      ...this.buildLabColumns<LabMedianRow>(model.labs, "lab")
    ];
  }

  /** Column definitions for date columns in labs median-by-day view. */
  buildDateColumnsForLabs<T>(dates: string[]): ColDef<T>[] {
    return dates.map((d) => ({
      field: d as never,
      headerName: d === NO_DATE_KEY ? "No date" : formatDateShort(d),
      headerClass: "ag-header-vertical",
      valueFormatter: (p: { value?: unknown }) =>
        p.value != null && Number(p.value) > 0 ? formatTimeMinutesOnly(Number(p.value)) : "",
      cellClass: "ag-right-aligned-cell",
      cellStyle: (p: { value?: unknown }) => ({
        backgroundColor: cellColorForMinutes(p.value as number),
        textAlign: "center",
        paddingLeft: "4px"
      }),
      width: 48,
      maxWidth: 72
    })) as ColDef<T>[];
  }
}
