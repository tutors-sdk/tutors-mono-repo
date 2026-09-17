<script lang="ts">
  import { cellIntensity, type HeatmapMatrix } from "@tutors/live-store";
  import { count, shortDay } from "$lib/format";

  /**
   * One heat map, drawn as inline SVG.
   *
   * Cells are `currentColor` at a varying opacity rather than a colour ramp, so
   * the map picks up whichever Tutors theme is active and reads correctly in
   * both light and dark without a second palette to keep in step.
   */
  interface Props {
    matrix: HeatmapMatrix;
    /** Shown above the grid; defaults to the matrix's own title. */
    title?: string;
  }
  let { matrix, title }: Props = $props();

  const CELL = 14;
  const GAP = 2;
  const LABEL_WIDTH = 78;
  const AXIS_HEIGHT = 18;

  const width = $derived(LABEL_WIDTH + matrix.x.length * (CELL + GAP));
  const height = $derived(matrix.y.length * (CELL + GAP) + AXIS_HEIGHT);
  /** Label every nth column, so 30 days of dates do not overlap. */
  const step = $derived(Math.max(1, Math.ceil(matrix.x.length / 12)));
  const empty = $derived(matrix.max === 0);

  /** Dates get a readable label; hours and other short labels are already readable. */
  function axisLabel(value: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? shortDay(value).replace(/^\w+ /, "") : value;
  }

  function cellTitle(row: number, column: number): string {
    return `${matrix.y[row]}, ${axisLabel(matrix.x[column])}: ${count(matrix.cells[row][column])} ${matrix.unit}`;
  }
</script>

<section class="card preset-filled-surface-100-900 flex min-w-0 flex-col gap-3 p-4">
  <header class="flex flex-wrap items-baseline justify-between gap-2">
    <h2 class="text-base font-semibold">{title ?? matrix.title}</h2>
    <span class="text-surface-600-400 text-xs">
      {matrix.unit}{matrix.scale === "log" ? ", log scale" : ""} · peak {count(matrix.max)}
    </span>
  </header>

  {#if empty}
    <p class="text-surface-600-400 py-6 text-center text-sm">No {matrix.unit} recorded in this range yet.</p>
  {:else}
    <div class="overflow-x-auto">
      <svg
        viewBox="0 0 {width} {height}"
        width={width}
        {height}
        role="img"
        aria-label="{title ?? matrix.title}: {matrix.y.length} rows by {matrix.x.length} columns of {matrix.unit}"
        class="text-primary-500 max-w-none"
      >
        {#each matrix.y as label, row (label)}
          <text
            x={LABEL_WIDTH - 6}
            y={row * (CELL + GAP) + CELL - 3}
            text-anchor="end"
            class="fill-surface-600-400 text-[10px]">{label}</text
          >
          {#each matrix.x as column, columnIndex (column)}
            <rect
              x={LABEL_WIDTH + columnIndex * (CELL + GAP)}
              y={row * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx="2"
              fill="currentColor"
              fill-opacity={cellIntensity(matrix.cells[row][columnIndex], matrix.max, matrix.scale)}
              class="stroke-surface-300-700"
              stroke-width="0.5"
            >
              <title>{cellTitle(row, columnIndex)}</title>
            </rect>
          {/each}
        {/each}

        {#each matrix.x as column, columnIndex (column)}
          {#if columnIndex % step === 0}
            <text
              x={LABEL_WIDTH + columnIndex * (CELL + GAP) + CELL / 2}
              y={matrix.y.length * (CELL + GAP) + 12}
              text-anchor="middle"
              class="fill-surface-600-400 text-[10px]">{axisLabel(column)}</text
            >
          {/if}
        {/each}
      </svg>
    </div>

    <div class="text-surface-600-400 flex items-center gap-2 text-xs">
      <span>less</span>
      {#each [0.1, 0.3, 0.55, 0.8, 1] as level (level)}
        <span class="bg-primary-500 inline-block size-3 rounded-sm" style="opacity: {level}"></span>
      {/each}
      <span>more</span>
    </div>
  {/if}
</section>
