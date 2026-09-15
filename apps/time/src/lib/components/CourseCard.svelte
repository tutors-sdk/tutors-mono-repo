<script lang="ts">
  import Icon from "@iconify/svelte";

  interface Props {
    /** Course display title */
    title: string;
    /** Optional subtitle (e.g. view type) */
    subtitle?: string | null;
    /** Optional Iconify icon (type + color) – shown when no courseImg */
    courseIcon?: { type: string; color: string | null } | null;
    /** Optional course image URL – shown when no courseIcon */
    courseImg?: string | null;
  }

  let { title, subtitle = null, courseIcon = null, courseImg = null }: Props = $props();
</script>

<div
  class="grid grid-cols-[auto_1fr] grid-rows-[auto_auto] items-center gap-x-2 gap-y-0 text-left h-full min-w-0"
  role="presentation"
>
  {#if courseIcon}
    <Icon
      icon={courseIcon.type}
      class="h-full w-auto shrink-0 row-span-2 self-center"
      style={courseIcon.color ? `color: ${courseIcon.color}` : undefined}
    />
  {:else if courseImg}
    <img
      src={courseImg}
      alt=""
      class="size-14 rounded object-contain shrink-0 row-span-2 self-center"
    />
  {/if}
  <p class="text-lg font-semibold truncate max-w-full">{title}</p>
  {#if subtitle}
    <p class="text-sm text-surface-600 truncate max-w-full">{subtitle}</p>
  {/if}
</div>
