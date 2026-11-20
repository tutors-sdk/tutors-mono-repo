<script lang="ts">
  import type { Finding, Severity } from "@tutors/course-rules";
  import { findingsHeadline } from "@tutors/course/validation";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";

  const { findings, scope = "source" }: { findings: Finding[]; scope?: "source" | "published" } = $props();
  let filter = $state<"all" | Severity>("all");
  const headingId = $props.id();
  const labels = { error: "Error", warn: "Warning", info: "Note" } as const;
  const counts = $derived({
    error: findings.filter((f) => f.severity === "error").length,
    warn: findings.filter((f) => f.severity === "warn").length,
    info: findings.filter((f) => f.severity === "info").length
  });
  const state = $derived(counts.error ? "error" : counts.warn ? "warn" : "success");
  const headline = $derived(
    counts.error
      ? `${counts.error} error${counts.error === 1 ? "" : "s"} need${counts.error === 1 ? "s" : ""} attention`
      : counts.warn
        ? `${counts.warn} warning${counts.warn === 1 ? "" : "s"} to review`
        : scope === "published"
          ? "Published course checks passed"
          : "Course checks passed"
  );
  const visible = $derived(filter === "all" ? findings : findings.filter((f) => f.severity === filter));
  const groups = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- this map is rebuilt during each derivation.
    const grouped = new Map<string, Finding[]>();
    for (const finding of visible) {
      const items = grouped.get(finding.path);
      if (items) items.push(finding);
      else grouped.set(finding.path, [finding]);
    }
    return [...grouped].map(([path, items]) => ({ path, items, errors: items.filter((f) => f.severity === "error").length }));
  });
  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- track replacement reports to reset their filter.
    findings;
    filter = "all";
  });
</script>

<section class="findings" aria-label="Course check">
  <div class="result-banner" data-state={state} role="status" aria-labelledby={headingId}>
    <span class="result-icon"><Icon icon={state === "success" ? "lucide:circle-check" : state === "error" ? "lucide:circle-x" : "lucide:triangle-alert"} height="32" /></span>
    <div>
      <p class="ui-eyebrow">{state === "success" ? "Passed" : state === "error" ? "Action needed" : "Review recommended"}</p>
      <h2 id={headingId} class="ui-section-title">{headline}</h2>
      <p class="result-description" data-testid="findings-headline">{findingsHeadline(findings)}</p>
      {#if state === "success"}<p class="ui-muted">
          {scope === "published"
            ? "The published course data and quiz checks found no errors or warnings. Source-file checks require a course ZIP."
            : "The source checks found no errors or warnings. Your course is ready for a final review in the reader."}
        </p>{/if}
    </div>
  </div>

  {#if findings.length > 0}
    <div class="finding-filters" role="group" aria-label="Filter findings">
      <button class="ui-button" aria-pressed={filter === "all"} onclick={() => (filter = "all")}>All <span class="count">{findings.length}</span></button>
      {#each ["error", "warn", "info"] as severity (severity)}
        {@const kind = severity as Severity}
        {#if counts[kind] > 0}<button class="ui-button" data-severity={kind} aria-pressed={filter === kind} onclick={() => (filter = kind)}
            >{labels[kind]}{counts[kind] === 1 ? "" : "s"} <span class="count">{counts[kind]}</span></button
          >{/if}
      {/each}
    </div>
    <p class="ui-muted finding-total">
      Showing {visible.length} finding{visible.length === 1 ? "" : "s"} in {groups.length} file{groups.length === 1 ? "" : "s"} or folder{groups.length === 1 ? "" : "s"}.
    </p>
    <div class="finding-groups">
      {#each groups as group (group.path)}
        <details class="finding-group ui-panel" open={group.errors > 0 || groups.length <= 3}>
          <summary>
            <span class="file-name"><Icon icon="lucide:file-text" height="18" /><code>{group.path || "Course folder"}</code></span>
            <span class="file-count">{group.items.length} finding{group.items.length === 1 ? "" : "s"}</span>
          </summary>
          <ul>
            {#each group.items as finding, index (index)}
              <li class="finding" data-severity={finding.severity}>
                <div class="finding-meta">
                  <span class="severity">{labels[finding.severity]}</span><code class="rule-id">{finding.rule}</code><span class="finding-path sr-only"
                    >{finding.path || "(course folder)"}</span
                  >
                </div>
                <p class="finding-message">{finding.message}</p>
                {#if finding.suggestedName}<p class="suggestion">Suggested name: <code>{finding.suggestedName}</code></p>{/if}
              </li>
            {/each}
          </ul>
        </details>
      {/each}
    </div>
  {/if}
</section>

<style>
  .result-banner {
    display: flex;
    gap: var(--space-4);
    align-items: start;
    padding: var(--space-6);
    border: 1px solid color-mix(in srgb, var(--result-colour) 40%, var(--ui-border));
    border-radius: var(--radius-card);
    background: color-mix(in srgb, var(--result-colour) 7%, var(--ui-surface));
  }
  .result-banner[data-state="success"] {
    --result-colour: var(--ui-success);
  }
  .result-banner[data-state="warn"] {
    --result-colour: var(--ui-warning);
  }
  .result-banner[data-state="error"] {
    --result-colour: var(--ui-danger);
  }
  .result-icon {
    color: var(--result-colour);
    flex: none;
  }
  .result-banner h2 {
    margin-block: var(--space-2);
  }
  .result-description {
    margin-bottom: var(--space-2);
  }
  .finding-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-6);
  }
  .finding-filters button {
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;
  }
  .count {
    border-radius: 999px;
    padding: 0 var(--space-2);
    background: var(--ui-raised);
    color: var(--ui-ink);
    font-size: var(--font-label);
  }
  .finding-total {
    margin-block: var(--space-3);
    font-size: var(--font-label);
  }
  .finding-groups {
    display: grid;
    gap: var(--space-4);
  }
  .finding-group {
    padding: 0;
    overflow: hidden;
  }
  summary {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::after {
    content: "+";
    color: var(--ui-muted);
    flex: none;
  }
  details[open] > summary::after {
    content: "−";
  }
  .file-name {
    display: inline-flex;
    align-items: start;
    gap: var(--space-2);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .file-count {
    margin-left: auto;
    white-space: nowrap;
    color: var(--ui-muted);
    font-size: var(--font-label);
  }
  .finding {
    padding: var(--space-4);
    border-top: 1px solid var(--ui-border);
    border-left: 4px solid var(--finding-colour);
  }
  .finding[data-severity="error"] {
    --finding-colour: var(--ui-danger);
  }
  .finding[data-severity="warn"] {
    --finding-colour: var(--ui-warning);
  }
  .finding[data-severity="info"] {
    --finding-colour: var(--ui-info);
  }
  .finding-meta {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    margin-bottom: var(--space-2);
    font-size: var(--font-label);
  }
  .severity {
    color: var(--finding-colour);
    font-weight: var(--weight-semibold);
  }
  .rule-id {
    color: var(--ui-ink);
    background: var(--ui-raised);
    border-radius: var(--radius-control);
    padding-inline: var(--space-2);
  }
  .finding-message {
    overflow-wrap: anywhere;
  }
  .suggestion {
    margin-top: var(--space-2);
    color: var(--ui-muted);
    font-size: var(--font-label);
  }
  @media (max-width: 600px) {
    .result-banner {
      padding: var(--space-4);
      gap: var(--space-3);
    }
    .file-count {
      display: none;
    }
  }
</style>
