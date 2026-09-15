<script lang="ts" module>
  /** Default Tailwind size for the inner avatar circle (matches {@link SentimentIcon} default). */
  export const STUDENT_AVATAR_DEFAULT_SIZE = "size-10";

  /** Outer frame behind the circle — neutral chip, analogous to sentiment badge backgrounds. */
  export const STUDENT_AVATAR_FRAME_CLASS = "bg-surface-200";
</script>

<script lang="ts">
  interface Props {
    /** Display name (initial fallback and default accessible label) */
    fullName: string;
    /** Optional image URL (e.g. tutors-connect-users `avatar_url`) */
    avatarUrl?: string | null;
    /** Tailwind size utility for the inner circle, e.g. `size-6`, `size-8`, `size-10`. */
    size?: string;
    /** Tailwind text size for the initial when there is no image */
    initialClass?: string;
    /** Extra classes on the outer badge */
    class?: string;
    /** Accessible label; defaults to `fullName` */
    label?: string;
  }

  let {
    fullName,
    avatarUrl = null,
    size = STUDENT_AVATAR_DEFAULT_SIZE,
    initialClass = "text-sm",
    class: className = "",
    label,
  }: Props = $props();

  const initial = $derived(
    fullName.trim().length > 0 ? fullName.trim().slice(0, 1).toUpperCase() : "?"
  );
  const ariaLabel = $derived(label ?? (fullName.trim() || "Student"));
</script>

<!-- Structure mirrors SentimentIcon: outer rounded badge + inner visual. -->
<span
  class="inline-flex items-center justify-center rounded-full p-0.5 {STUDENT_AVATAR_FRAME_CLASS} {className}"
  role="img"
  aria-label={ariaLabel}
>
  <span
    class="inline-flex shrink-0 overflow-hidden rounded-full bg-surface-200 {size}"
  >
    {#if avatarUrl}
      <img src={avatarUrl} alt="" class="h-full w-full object-cover" />
    {:else}
      <span
        class="flex h-full w-full items-center justify-center bg-surface-300 font-semibold text-surface-600 {initialClass}"
        aria-hidden="true"
      >
        {initial}
      </span>
    {/if}
  </span>
</span>
