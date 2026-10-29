import { t } from "@tutors/i18n";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import type { LabModel, LabRow, LabMedianRow } from "@tutors/tutors-time-lib";
import {
  heatColor,
  minutesOf,
  formatTimeMinutesOnly,
  formatDateShort,
  extractStepName,
  labColumnLabels
} from "@tutors/tutors-time-lib";
import { OnlineCellRenderer } from "#lib/components/calendar/OnlineCellRenderer.ts";
import { SentimentCellRenderer } from "#lib/components/calendar/SentimentCellRenderer.ts";
import { StudentAvatarCellRenderer } from "#lib/components/calendar/StudentAvatarCellRenderer.ts";
import { withDateRange } from "#lib/dateRange.ts";

/** Header mode: "lab" = lab id (with its topic when two labs share an id), "step" = step name (last segment). */
type LabColumnHeaderMode = "lab" | "step";

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

  private buildTotalMinutesColumn<T>(field: string = "totalMinutes", headerName = t("time.total")): ColDef<T> {
    return {
      field: field as never,
      headerName,
      sort: "desc",
      valueFormatter: (p) =>
        p.value != null && Number(p.value) > 0 ? String(Math.round(Number(p.value))) : "",
      cellClass: "ag-right-aligned-cell",
      cellStyle: { fontWeight: "600", paddingLeft: "4px" },
      width: 96,
      maxWidth: 112
    };
  }

  private buildLabColumns<T>(labIds: string[], mode: LabColumnHeaderMode): ColDef<T>[] {
    const labLabels = mode === "lab" ? labColumnLabels(labIds) : [];
    return labIds.map((labId, index) => {
      const headerName = mode === "lab" ? labLabels[index] : extractStepName(labId);
      const headerTooltip = labId !== headerName ? labId : undefined;
      return {
        field: labId as never,
        headerName,
        headerTooltip,
        headerClass: "ag-header-vertical",
        valueFormatter: (p) =>
          p.value != null && Number(p.value) > 0 ? formatTimeMinutesOnly(Number(p.value)) : "",
        cellClass: "ag-right-aligned-cell",
        cellStyle: (p) => ({
          backgroundColor: heatColor(minutesOf(p.value)),
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
        headerName: t("classTime.name"),
        minWidth: 160,
        flex: 1,
        pinned: "left",
        cellStyle: { paddingLeft: "4px" },
        cellRenderer: (params: ICellRendererParams<LabRow>) => {
          const name = String(params.value ?? "");
          const studentId = String(params.data?.studentid ?? "");
          if (!studentId || !courseId) return name;
          // The grid renders in the browser (ssr is off); the drill-down keeps the page's reporting period.
          return `<a href="${withDateRange(`/${courseId}/${studentId}`, location.search)}" class="underline text-[var(--ui-brand)]">${name}</a>`;
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
        headerName: t("classTime.share"),
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
        headerName: t("classTime.mood"),
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
        headerName: t("classTime.github"),
        minWidth: 120,
        maxWidth: 112,
        width: 96,
        pinned: "left",
        cellStyle: { paddingLeft: "4px" },
        cellRenderer: (params: ICellRendererParams<LabRow>) => {
          const studentId = String(params.value ?? "");
          if (!studentId || studentId === "Course median") return studentId === "Course median" ? "—" : studentId;
          return `<a href="https://github.com/${studentId}" target="_blank" rel="noopener noreferrer" class="underline text-[var(--ui-brand)]">${studentId}</a>`;
        }
      }
    ];
  }

  private buildLabColumnDefs(model: LabModel): ColDef<LabRow>[] {
    return [
      ...this.buildStudentColumns(model.courseId),
      this.buildTotalMinutesColumn<LabRow>("totalMinutes", t("time.total")),
      ...this.buildLabColumns<LabRow>(model.labs, "lab")
    ];
  }

  private buildStepColumnDefs(model: LabModel): ColDef<LabRow>[] {
    return [
      ...this.buildStudentColumns(model.courseId),
      this.buildTotalMinutesColumn<LabRow>("totalMinutes", t("time.total")),
      ...this.buildLabColumns<LabRow>(model.steps, "step")
    ];
  }

  private buildMedianByLabStepColumnDefs(model: LabModel): ColDef<LabMedianRow>[] {
    return [
      this.buildTotalMinutesColumn<LabMedianRow>("totalMinutes", t("time.total")),
      ...this.buildLabColumns<LabMedianRow>(model.steps, "step")
    ];
  }

  private buildMedianByLabColumnDefs(model: LabModel): ColDef<LabMedianRow>[] {
    return [
      this.buildTotalMinutesColumn<LabMedianRow>("totalMinutes", t("time.total")),
      ...this.buildLabColumns<LabMedianRow>(model.labs, "lab")
    ];
  }

  /** Column definitions for date columns in labs median-by-day view. */
  buildDateColumnsForLabs<T>(dates: string[]): ColDef<T>[] {
    return dates.map((d) => ({
      field: d as never,
      headerName: d === NO_DATE_KEY ? t("classTime.noDate") : formatDateShort(d),
      headerClass: "ag-header-vertical",
      valueFormatter: (p: { value?: unknown }) =>
        p.value != null && Number(p.value) > 0 ? formatTimeMinutesOnly(Number(p.value)) : "",
      cellClass: "ag-right-aligned-cell",
      cellStyle: (p: { value?: unknown }) => ({
        backgroundColor: heatColor(minutesOf(p.value)),
        textAlign: "center",
        paddingLeft: "4px"
      }),
      width: 48,
      maxWidth: 72
    })) as ColDef<T>[];
  }
}
