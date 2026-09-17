<script lang="ts">
  /** One headline number, with the unit spelled out under it. */
  interface Props {
    label: string;
    value: string;
    hint?: string;
    /** Marks the tile as tracking a live value, so it reads differently from a historical one. */
    live?: boolean;
  }
  let { label, value, hint, live = false }: Props = $props();
</script>

<div class="card preset-filled-surface-100-900 flex min-w-0 flex-col gap-1 p-4">
  <div class="flex items-center gap-2">
    {#if live}
      <span class="bg-success-500 inline-block size-2 shrink-0 animate-pulse rounded-full" aria-hidden="true"></span>
    {/if}
    <span class="text-surface-600-400 truncate text-xs font-medium tracking-wide uppercase">{label}</span>
  </div>
  <span class="text-2xl leading-tight font-semibold tabular-nums">{value}</span>
  {#if hint}
    <span class="text-surface-600-400 truncate text-xs">{hint}</span>
  {/if}
</div>
