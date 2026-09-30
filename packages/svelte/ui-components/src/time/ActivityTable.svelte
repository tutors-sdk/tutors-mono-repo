<script lang="ts">
  import { t } from "@tutors/i18n";
  import { heatColor, minutesOf } from "@tutors/tutors-time-lib";

  interface Row { label: string; values: Record<string, unknown> | null | undefined; total: unknown; median?: boolean }
  /** Minutes per column for the student and the course median, one heat-tinted cell per column. */
  let { title, columns, rows }: { title: string; columns: { key: string; label: string }[]; rows: Row[] } = $props();
  const shown = $derived(rows.filter(row => row.values));
</script>

{#if shown.length}
  <section class="ui-panel">
    <h2 class="ui-section-title">{title}</h2>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <td></td>
            {#each columns as column}<th scope="col" title={column.label}><span>{column.label}</span></th>{/each}
            <th scope="col" class="total">{t("time.total")}</th>
          </tr>
        </thead>
        <tbody>
          {#each shown as row}
            <tr class:median={row.median}>
              <th scope="row">{row.label}</th>
              {#each columns as column}
                {@const minutes = minutesOf(row.values?.[column.key])}
                <td style:background-color={heatColor(minutes) || null}>{minutes || "—"}</td>
              {/each}
              <td class="total">{minutesOf(row.total) || "—"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

<style>
  .table-scroll { overflow-x: auto; margin-top: var(--space-4); }
  table { border-collapse: separate; border-spacing: 3px; font-size: var(--font-meta); font-variant-numeric: tabular-nums; }
  thead th { padding: 0 0 var(--space-2); vertical-align: bottom; font-weight: var(--weight-medium); color: var(--ui-muted); }
  thead th span { display: inline-block; max-height: 10rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; writing-mode: vertical-rl; transform: rotate(180deg); }
  tbody th { position: sticky; left: 0; z-index: 1; min-width: 10rem; padding: 0 var(--space-4) 0 0; background: var(--ui-surface); text-align: left; font-weight: var(--weight-medium); white-space: nowrap; }
  td { min-width: 40px; height: 36px; padding: 0 var(--space-1); border-radius: 4px; text-align: center; background: var(--ui-canvas); }
  thead td { background: none; }
  .median th { font-weight: var(--weight-semibold); }
  .total { min-width: 3.5rem; padding-left: var(--space-3); text-align: right; background: none; font-weight: var(--weight-semibold); }
  thead .total { writing-mode: horizontal-tb; }
</style>
