<script lang="ts">
  import type { Observation, Severity } from "@tutors/live-store";

  /**
   * The automatic observations.
   *
   * Each card says what the rule saw and what the number was, because an alert
   * that only says "unusual" leaves the reader with the whole investigation.
   */
  interface Props {
    observations: Observation[];
  }
  let { observations }: Props = $props();

  const preset: Record<Severity, string> = {
    critical: "preset-outlined-error-500",
    warning: "preset-outlined-warning-500",
    info: "preset-outlined-primary-500"
  };
</script>

<section class="card preset-filled-surface-100-900 flex min-w-0 flex-col gap-3 p-4">
  <h2 class="text-base font-semibold">Observations</h2>
  {#if observations.length === 0}
    <p class="text-surface-600-400 py-4 text-center text-sm">Nothing out of the ordinary.</p>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each observations as observation (observation.id)}
        <li class="card {preset[observation.severity]} flex flex-col gap-1 p-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="text-sm font-semibold">{observation.title}</span>
            <span class="badge preset-tonal text-xs">{observation.kind}</span>
          </div>
          <p class="text-surface-600-400 text-xs leading-relaxed">{observation.detail}</p>
          {#if observation.course}
            <a class="anchor text-xs" href="/course/{observation.course}">Open {observation.course}</a>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>
