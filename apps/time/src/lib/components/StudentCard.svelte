<script lang="ts">
  interface Props {
    /** Display name (e.g. full name from tutors-connect-users) */
    fullName: string;
    /** Optional avatar image URL; if missing, shows initial letter */
    avatarUrl?: string | null;
    /** Compact style for app bar (smaller avatar, single row) */
    compact?: boolean;
  }

  let { fullName, avatarUrl = null, compact = false }: Props = $props();
</script>

<div
  class="card shrink-0 flex items-center min-w-0 {compact
    ? 'p-2 gap-2 flex-row'
    : 'p-4 gap-3 flex-row sm:flex-col'}"
>
  {#if avatarUrl}
    <img
      src={avatarUrl}
      alt=""
      class="rounded-full object-cover bg-surface-200 {compact ? 'size-14' : 'size-20 sm:size-24'}"
    />
  {:else}
    <div
      class="rounded-full bg-surface-300 flex items-center justify-center text-surface-600 font-semibold shrink-0 {compact
        ? 'size-14 text-base'
        : 'size-20 sm:size-24 text-2xl'}"
      aria-hidden="true"
    >
      {fullName.slice(0, 1).toUpperCase()}
    </div>
  {/if}
  <p
    class="font-semibold text-surface-800 truncate max-w-full {compact ? 'text-sm' : 'text-lg'}"
  >
    {fullName}
  </p>
</div>
