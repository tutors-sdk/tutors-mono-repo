<script lang="ts">
  import { cellIntensity, type HeatmapMatrix } from "@tutors/live-store";
  import { count, shortDay } from "$lib/format";

  /**
   * One heat map, drawn as inline SVG.
   *
   * Cells are `currentColor` at a varying opacity rather than a colour ramp, so
   * the map picks up whichever Tutors theme is active and reads correctly in
   * both light and dark without a second palette to keep in step.
   *
   * The grid scales with the viewBox rather than sitting at a fixed cell size,
   * so a wide screen gets big cells instead of a postage stamp with a scrollbar.
   */
  interface Props {
    matrix: HeatmapMatrix;
    /** Shown above the grid; defaults to the matrix's own title. */
    title?: string;
  }
  let { matrix, title }: Props = $props();

  const CELL = 16;
  const GAP = 2;
  const AXIS_HEIGHT = 20;
  const TOTALS_WIDTH = 46;
  /** Roughly the width of one character at the 10px label size. */
  const CHAR_WIDTH = 5.7;

  /** Wide enough for the longest row label, so nothing is truncated to a stub. */
  const labelWidth = $derived(Math.min(230, Math.max(46, ...matrix.y.map((label) => label.length * CHAR_WIDTH + 12))));
  const width = $derived(labelWidth + matrix.x.length * (CELL + GAP) + TOTALS_WIDTH);
  const height = $derived(matrix.y.length * (CELL + GAP) + AXIS_HEIGHT);
  const empty = $derived(matrix.max === 0);

  /** Totals per row: a heat map says "when", and the total says "how much". */
  const totals = $derived(matrix.cells.map((row) => row.reduce((sum, value) => sum + value, 0)));

  const isDateAxis = $derived(matrix.x.every((label) => /^\d{4}-\d{2}-\d{2}$/.test(label)));

  /** Saturday and Sunday, shaded so the teaching week stands out from it. */
  const weekendColumns = $derived(
    isDateAxis
      ? matrix.x.map((day) => {
          const weekday = new Date(`${day}T00:00:00`).getDay();
          return weekday === 0 || weekday === 6;
        })
      : matrix.x.map(() => false)
  );

  /**
   * A short range has room for a label on every column, but only if the label
   * is the day number; a long one gets one label per Monday and can spell the
   * month out.
   */
  const dense = $derived(matrix.x.length <= 10);

  const labelledColumns = $derived(
    matrix.x.map((label, index) => {
      if (dense) return true;
      if (!isDateAxis) return index % Math.max(1, Math.ceil(matrix.x.length / 12)) === 0;
      if (index === 0) return true;
      return new Date(`${label}T00:00:00`).getDay() === 1;
    })
  );

  /**
   * The weekday is already the point of the grid and never fits, so a date axis
   * shows the day number, plus the month when the labels are far enough apart
   * to carry it. The full date is in the readout and in each cell's title.
   */
  function axisLabel(value: string): string {
    if (!isDateAxis) return value;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return dense ? `${date.getDate()}` : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function cellLabel(row: number, column: number): string {
    return `${matrix.y[row]} · ${isDateAxis ? shortDay(matrix.x[column]) : `${matrix.x[column]}:00`} · ${count(matrix.cells[row][column])} ${matrix.unit}`;
  }

  /** What the pointer is over, shown in the header rather than in a native tooltip. */
  let hovered = $state<{ row: number; column: number } | null>(null);
  const readout = $derived(hovered ? cellLabel(hovered.row, hovered.column) : null);

  /**
   * A non-zero cell never falls below this, so a single session is visible
   * rather than indistinguishable from an empty day.
   */
  const FLOOR = 0.16;
  function opacity(value: number): number {
    if (value <= 0) return 0;
    return FLOOR + (1 - FLOOR) * cellIntensity(value, matrix.max, matrix.scale);
  }
</script>

<section class="card preset-filled-surface-100-900 flex min-w-0 flex-col gap-3 p-4">
  <header class="flex flex-wrap items-baseline justify-between gap-2">
    <h2 class="text-base font-semibold">{title ?? matrix.title}</h2>
    <span class="text-surface-600-400 truncate text-xs" aria-live="polite">
      {#if readout}
        {readout}
      {:else}
        {matrix.unit}{matrix.scale === "log" ? ", log scale" : ""} · peak {count(matrix.max)}
      {/if}
    </span>
  </header>

  {#if empty}
    <p class="text-surface-600-400 py-6 text-center text-sm">No {matrix.unit} recorded in this range yet.</p>
  {:else}
    <div class="w-full overflow-x-auto">
      <svg
        viewBox="0 0 {width} {height}"
        role="img"
        aria-label="{title ?? matrix.title}: {matrix.y.length} rows by {matrix.x.length} columns of {matrix.unit}"
        class="text-primary-500 block h-auto w-full"
        style="min-width: {Math.min(width, 560)}px; max-width: {width * 2.2}px"
        onpointerleave={() => (hovered = null)}
      >
        {#each weekendColumns as weekend, columnIndex (columnIndex)}
          {#if weekend}
            <rect
              x={labelWidth + columnIndex * (CELL + GAP) - GAP / 2}
              y="-2"
              width={CELL + GAP}
              height={matrix.y.length * (CELL + GAP) + 4}
              class="fill-surface-500/10"
            />
          {/if}
        {/each}

        {#each matrix.y as label, row (label)}
          <g class="heat-row" class:is-hovered={hovered?.row === row}>
            <rect
              x="0"
              y={row * (CELL + GAP) - GAP / 2}
              width={width}
              height={CELL + GAP}
              class="heat-row-band fill-surface-500/0"
            />
            <text x={labelWidth - 8} y={row * (CELL + GAP) + CELL - 4} text-anchor="end" class="fill-surface-700-300 text-[10px]">
              {label}
            </text>

            {#each matrix.x as column, columnIndex (column)}
              <!-- The grid is exposed as one labelled image, so a cell is not a
                   separate target for assistive technology; the pointer handler
                   only drives the readout in the header, and the same text is in
                   the cell's <title> and in the row and column labels. -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <rect
                x={labelWidth + columnIndex * (CELL + GAP)}
                y={row * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx="2"
                fill="currentColor"
                fill-opacity={opacity(matrix.cells[row][columnIndex])}
                class="stroke-surface-400-600/40"
                stroke-width="0.5"
                onpointerenter={() => (hovered = { row, column: columnIndex })}
              >
                <title>{cellLabel(row, columnIndex)}</title>
              </rect>
            {/each}

            <text
              x={width - 6}
              y={row * (CELL + GAP) + CELL - 4}
              text-anchor="end"
              class="fill-surface-700-300 text-[10px] font-semibold tabular-nums"
            >
              {count(totals[row])}
            </text>
          </g>
        {/each}

        {#each matrix.x as column, columnIndex (column)}
          {#if labelledColumns[columnIndex]}
            <text
              x={labelWidth + columnIndex * (CELL + GAP) + CELL / 2}
              y={matrix.y.length * (CELL + GAP) + 13}
              text-anchor="middle"
              class="fill-surface-600-400 text-[10px]">{axisLabel(column)}</text
            >
          {/if}
        {/each}

        <text x={width - 6} y={matrix.y.length * (CELL + GAP) + 13} text-anchor="end" class="fill-surface-600-400 text-[9px] uppercase">
          total
        </text>
      </svg>
    </div>

    <div class="text-surface-600-400 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span class="flex items-center gap-2">
        <span>less</span>
        {#each [0, 0.25, 0.5, 0.75, 1] as level (level)}
          <span class="bg-primary-500 inline-block size-3 rounded-sm" style="opacity: {FLOOR + (1 - FLOOR) * level}"></span>
        {/each}
        <span>more</span>
      </span>
      {#if isDateAxis}
        <span class="flex items-center gap-1">
          <span class="bg-surface-500/20 inline-block size-3 rounded-sm"></span>
          weekend
        </span>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* Row highlight on hover: the grid is wide, and following one course across
     31 days by eye is the thing it is most often asked to do. */
  .heat-row:hover .heat-row-band {
    fill: color-mix(in oklab, currentColor 12%, transparent);
  }
  .heat-row rect {
    transition: fill-opacity 120ms ease;
  }
</style>
