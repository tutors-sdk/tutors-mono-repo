<script lang="ts">
  import { RANGES, type RangeName } from "@tutors/live-store";

  /** Today / 7d / 30d: the three layers the dashboard is built around. */
  interface Props {
    value: RangeName;
    onchange: (range: RangeName) => void;
  }
  let { value, onchange }: Props = $props();

  const labels: Record<RangeName, string> = { today: "Today", "7d": "7 days", "30d": "30 days" };
</script>

<div class="btn-group preset-outlined-surface-200-800 flex-row" role="group" aria-label="Time range">
  {#each RANGES as range (range)}
    <button
      type="button"
      class="btn btn-sm {value === range ? 'preset-filled-primary-500' : 'preset-tonal'}"
      aria-pressed={value === range}
      onclick={() => onchange(range)}
    >
      {labels[range]}
    </button>
  {/each}
</div>
