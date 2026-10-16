<script lang="ts">
  import { t } from "@tutors/i18n";
  import type { DailyResponseTimes } from "@tutors/insights";
  import { duration, KIND_LABELS, KINDS } from "./format.ts";

  interface Props {
    /** One entry per day with a request, oldest first (Rule 0413). */
    days: DailyResponseTimes[];
    /** False when percentiles were withheld for a small cohort (Rule 0415). */
    percentilesShown: boolean;
  }

  let { days, percentilesShown }: Props = $props();

  const units = $derived({ seconds: t("insights.seconds"), minutes: t("insights.minutes") });
  /** The rows worth a line: a day and kind with at least one request acknowledged or resolved. */
  const rows = $derived(
    days.flatMap((d) => KINDS.filter((k) => d.times[k].acknowledge.count + d.times[k].resolve.count > 0).map((k) => ({ day: d.day, kind: k, times: d.times[k] })))
  );
</script>

<div class="table-scroll">
  <table class="response">
    <caption class="visually-hidden">{t("insights.response")}</caption>
    <thead>
      <tr>
        <th scope="col" rowspan="2">{t("insights.day")}</th>
        <th scope="col" rowspan="2">{t("insights.kind")}</th>
        <th scope="colgroup" colspan={percentilesShown ? 3 : 1}>{t("insights.toAcknowledge")}</th>
        <th scope="colgroup" colspan={percentilesShown ? 3 : 1}>{t("insights.toResolve")}</th>
      </tr>
      <tr>
        <th scope="col">{t("insights.requests")}</th>
        {#if percentilesShown}<th scope="col">{t("insights.median")}</th><th scope="col">{t("insights.p90")}</th>{/if}
        <th scope="col">{t("insights.requests")}</th>
        {#if percentilesShown}<th scope="col">{t("insights.median")}</th><th scope="col">{t("insights.p90")}</th>{/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as row (`${row.day}-${row.kind}`)}
        <tr>
          <th scope="row">{row.day}</th>
          <td class="kind">{t(KIND_LABELS[row.kind])}</td>
          <td>{row.times.acknowledge.count}</td>
          {#if percentilesShown}<td>{duration(row.times.acknowledge.median, units)}</td><td>{duration(row.times.acknowledge.p90, units)}</td>{/if}
          <td>{row.times.resolve.count}</td>
          {#if percentilesShown}<td>{duration(row.times.resolve.median, units)}</td><td>{duration(row.times.resolve.p90, units)}</td>{/if}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .table-scroll { overflow-x: auto; }
  .response { width: 100%; border-collapse: collapse; font-size: var(--font-label); font-variant-numeric: tabular-nums; }
  th, td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--ui-border); text-align: end; white-space: nowrap; }
  thead th { color: var(--ui-muted); font-weight: var(--weight-medium); text-align: center; }
  tbody th, .kind { text-align: start; font-weight: var(--weight-medium); }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
