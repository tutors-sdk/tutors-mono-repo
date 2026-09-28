<script lang="ts">
  import type { LoRecord } from "@tutors/community";
  import StudentCard from "@tutors/ui-primitives/components/StudentCard.svelte";

  interface Props {
    los: LoRecord[];
    emptyMessage: string;
  }
  let { los, emptyMessage }: Props = $props();
</script>

<div class="ui-grid card-grid">
  {#each los as lo}
    <div class="min-w-0"><StudentCard {lo} /></div>
  {:else}
    <p class="ui-empty">{emptyMessage}</p>
  {/each}
</div>
