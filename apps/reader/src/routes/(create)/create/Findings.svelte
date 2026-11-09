<script lang="ts">
  import type { Finding } from "@tutors/course-rules";
  import { findingsHeadline } from "./check";

  type Props = { findings: Finding[] };
  let { findings }: Props = $props();

  const labels = { error: "Error", warn: "Warning", info: "Note" } as const;
</script>

<section class="findings space-y-2" aria-label="Course check">
  <p class="ui-section-title" data-testid="findings-headline">{findingsHeadline(findings)}</p>
  {#if findings.length > 0}
    <ul class="space-y-2">
      {#each findings as finding (`${finding.rule} ${finding.path} ${finding.message}`)}
        <li class="finding ui-panel text-left" data-severity={finding.severity}>
          <p>
            <strong>{labels[finding.severity]}</strong>
            <code>{finding.rule}</code>
            <span class="finding-path">{finding.path === "" ? "(course folder)" : finding.path}</span>
          </p>
          <p class="finding-message">{finding.message}</p>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .finding[data-severity="error"] {
    border-left: 4px solid var(--ui-danger);
  }
  .finding[data-severity="warn"] {
    border-left: 4px solid var(--ui-warning);
  }
  .finding[data-severity="info"] {
    border-left: 4px solid var(--ui-info);
  }
  .finding-path {
    font-family: monospace;
    word-break: break-all;
  }
</style>
