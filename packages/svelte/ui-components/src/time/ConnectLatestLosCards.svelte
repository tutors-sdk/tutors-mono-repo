<script lang="ts">
  import type { LoRecord } from "@tutors/community";
  import StudentCard from "@tutors/ui-primitives/components/StudentCard.svelte";

  interface Props {
    los: LoRecord[];
    emptyMessage: string;
  }
  let { los, emptyMessage }: Props = $props();
</script>

<div class="ui-grid pt-4">
  {#each los as lo}
    <StudentCard {lo} />
  {:else}
    <p class="text-surface-600-300-token text-sm">{emptyMessage}</p>
  {/each}
</div>
