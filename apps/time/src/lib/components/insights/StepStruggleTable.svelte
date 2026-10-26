<script lang="ts">
  import { t } from "@tutors/i18n";
  import type { StepStruggle } from "@tutors/insights";
  import { duration, KIND_LABELS, KINDS, stepName } from "./format.ts";

  interface Props {
    /** Hardest first, as the reader ranked them (Rule 0412). */
    steps: StepStruggle[];
    /** False when percentiles were withheld for a small cohort (Rule 0415); a step asked about by fewer than 5 students shows a dash (Rule 0571). */
    percentilesShown: boolean;
  }

  let { steps, percentilesShown }: Props = $props();

  const units = $derived({ seconds: t("insights.seconds"), minutes: t("insights.minutes") });
  const most = $derived(Math.max(1, ...steps.map((s) => s.total)));
</script>

<div class="table-scroll">
  <table class="struggle">
    <caption class="visually-hidden">{t("insights.steps")}</caption>
    <thead>
      <tr>
        <th scope="col">{t("insights.step")}</th>
        <th scope="col">{t("insights.requests")}</th>
        {#each KINDS as kind (kind)}<th scope="col">{t(KIND_LABELS[kind])}</th>{/each}
        {#if percentilesShown}
          <th scope="col">{t("insights.medianWait")}</th>
          <th scope="col">{t("insights.p90Wait")}</th>
        {/if}
        <th scope="col">{t("insights.acknowledged")}</th>
        <th scope="col">{t("insights.helpedByHint")}</th>
        <th scope="col">{t("insights.annotations")}</th>
      </tr>
    </thead>
    <tbody>
      {#each steps as step (`${step.ref.labRoute}#${step.ref.stepId}`)}
        <tr>
          <th scope="row" class="step">{stepName(step.ref.labRoute, step.ref.stepId)}</th>
          <td class="total" title={`${step.total} ${t("insights.barLabel")}`}>
            <span class="bar" style:inline-size={`${(step.total / most) * 100}%`} aria-hidden="true"></span>
            <span class="value">{step.total}</span>
          </td>
          {#each KINDS as kind (kind)}<td>{step.requests[kind]}</td>{/each}
          {#if percentilesShown}
            <td>{duration(step.medianWaitSeconds, units)}</td>
            <td>{duration(step.p90WaitSeconds, units)}</td>
          {/if}
          <td>{step.acknowledged}</td>
          <td>{step.helpedByHint}</td>
          <td>{step.annotations}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .table-scroll { overflow-x: auto; }
  .struggle { width: 100%; border-collapse: collapse; font-size: var(--font-label); font-variant-numeric: tabular-nums; }
  th, td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--ui-border); text-align: end; white-space: nowrap; }
  thead th { color: var(--ui-muted); font-weight: var(--weight-medium); }
  th:first-child, .step { text-align: start; font-weight: var(--weight-medium); overflow-wrap: anywhere; white-space: normal; }
  .total { position: relative; min-inline-size: 140px; }
  .total .bar { position: absolute; inset-block: 25%; inset-inline-start: var(--space-3); max-inline-size: calc(100% - var(--space-10)); border-radius: 0 4px 4px 0; background: var(--ui-muted); opacity: 0.35; }
  .total .value { position: relative; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
