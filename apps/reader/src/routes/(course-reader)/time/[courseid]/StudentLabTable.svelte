<script lang="ts">
  import { heatStyle } from "./heat";
  import type { LabRow, LabMedianRow } from "@tutors/tutors-time-lib";
  import { extractLabIdentifier } from "@tutors/tutors-time-lib";
  import { formatTimeMinutesOnly } from "@tutors/tutors-time-lib";
  import { t } from "@tutors/i18n";

  interface Props {
    courseid: string;
    studentid: string;
    studentLabRow: LabRow | null;
    labMedianRow: LabMedianRow | null;
    labColumns: string[];
  }

  let { courseid, studentid, studentLabRow, labMedianRow, labColumns }: Props = $props();

  function formatLabTime(minutes: number | undefined): string {
    if (minutes == null || minutes === 0) return "—";
    return formatTimeMinutesOnly(minutes);
  }
</script>

{#if studentLabRow}
  <section class="ui-panel">
    <h2 class="ui-section-title mb-4">{t("time.labByLab")}</h2>
    <div class="overflow-x-auto">
      <table class="table w-full border-collapse" style="table-layout: fixed;">
        <thead>
          <tr class="border-b-2 border-[var(--ui-border)]">
            <th class="text-left py-4 px-4" style="width: 160px;">{t("time.name")}</th>
            <th class="text-left py-4 px-4" style="width: 120px;">{t("time.github")}</th>
            {#each labColumns as labId}
              <th class="text-center py-4 px-1 align-middle" style="width: 36px; min-width: 36px; max-width: 36px; height: 140px; overflow: hidden;">
                <div class="transform -rotate-90 whitespace-nowrap text-xs" style="height: 100%; display: flex; align-items: center; justify-content: center;">
                  {extractLabIdentifier(labId)}
                </div>
              </th>
            {/each}
            <th class="text-right py-4 px-4">{t("time.total")}</th>
          </tr>
        </thead>
        <tbody>
          <!-- Student Row -->
          <tr class="border-b border-[var(--ui-border)] hover:bg-[var(--ui-selected)]">
            <td class="py-3 px-4" style="width: 160px;">
              {studentLabRow.full_name}
            </td>
            <td class="py-3 px-4" style="width: 120px;">
              <a href="https://github.com/{studentid}" target="_blank" rel="noopener noreferrer" class="underline text-[var(--ui-brand)]">
                {studentLabRow.studentid}
              </a>
            </td>
            {#each labColumns as labId}
              {@const labBlocks = studentLabRow[labId] as number | undefined}
              <td class="py-3 px-1 text-center font-mono text-xs" style="width: 36px; min-width: 36px; max-width: 36px; {heatStyle(labBlocks ?? 0)}">
                {formatLabTime(labBlocks)}
              </td>
            {/each}
            <td class="py-3 px-4 text-right font-mono font-semibold" style="{heatStyle(studentLabRow.totalMinutes ?? 0)}">
              {formatLabTime(studentLabRow.totalMinutes)}
            </td>
          </tr>
          <!-- Median Row -->
          {#if labMedianRow}
            <tr class="border-b-2 border-[var(--ui-border)] bg-[var(--ui-raised)]">
              <td class="py-3 px-4 font-semibold" style="width: 160px;">{t("time.median")}</td>
              <td class="py-3 px-4" style="width: 120px;">—</td>
              {#each labColumns as labId}
                {@const labBlocks = labMedianRow[labId] as number | undefined}
                <td class="py-3 px-1 text-center font-mono text-xs" style="width: 36px; min-width: 36px; max-width: 36px; {heatStyle(labBlocks ?? 0)}">
                  {formatLabTime(labBlocks)}
                </td>
              {/each}
              <td class="py-3 px-4 text-right font-mono font-semibold" style="{heatStyle(labMedianRow.totalMinutes ?? 0)}">
                {formatLabTime(labMedianRow.totalMinutes)}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </section>
{/if}
