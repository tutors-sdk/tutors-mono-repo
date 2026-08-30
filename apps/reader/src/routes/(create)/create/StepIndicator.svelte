<script lang="ts">
  type Props = {
    steps: string[];
    current: number;
    onjump: (index: number) => void;
  };
  let { steps, current, onjump }: Props = $props();
</script>

<div class="flex items-center justify-center gap-2">
  {#each steps as step, i}
    <div class="flex items-center gap-2">
      <button
        class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors
          {i === current
          ? 'bg-primary-500 text-white'
          : i < current
            ? 'bg-success-500 text-white'
            : 'bg-surface-300 dark:bg-surface-600 text-surface-600 dark:text-surface-300'}"
        onclick={() => {
          if (i < current) onjump(i);
        }}
        disabled={i > current}
      >
        {#if i < current}&#10003;{:else}{i + 1}{/if}
      </button>
      <span class="hidden text-sm sm:inline {i === current ? 'font-bold' : 'text-surface-500'}">{step}</span>
      {#if i < steps.length - 1}<div class="mx-1 h-px w-8 bg-surface-300 dark:bg-surface-600"></div>{/if}
    </div>
  {/each}
</div>
