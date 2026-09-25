<script lang="ts">
  let { steps, current, onjump }: { steps: string[]; current: number; onjump: (index: number) => void } = $props();
</script>

<nav aria-label="Course creation steps" class="creation-steps">
  {#each steps as step, i}
    <button class="ui-button" aria-current={i === current ? 'step' : undefined} disabled={i > current} onclick={() => onjump(i)}>
      <span aria-hidden="true">{i < current ? '✓' : i + 1}</span><span>{step}</span>
    </button>
  {/each}
</nav>

<style>
  .creation-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-2); }
  button { flex-wrap: wrap; padding-inline: var(--space-2); }
  button[aria-current] { background: var(--ui-selected); border-color: var(--ui-brand); }
  button:disabled { opacity: .6; }
  @media (max-width: 600px) { .creation-steps { grid-template-columns: repeat(2, 1fr); } }
</style>
