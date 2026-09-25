<script lang="ts">
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  interface Props {
    courseId: string;
    courseTitle: string;
  }
  let { courseId, courseTitle }: Props = $props();
</script>

<div class="flex w-full flex-wrap items-center justify-between gap-3 pb-4">
  <h2 class="p-2 text-base font-semibold">
    <a
      target="_blank"
      rel="noopener noreferrer"
      href="https://tutors.dev/course/{courseId}"
      class="inline-flex items-center gap-2 text-[var(--ui-brand)] underline underline-offset-4"
    >
      <Icon type="course" height="20" /><span>{courseTitle}</span>
    </a>
  </h2>
  <h2 class="p-2 text-base font-semibold">
    <a
      target="_blank"
      rel="noopener noreferrer"
      href="/{courseId}"
      class="inline-flex items-center gap-2 text-[var(--ui-brand)] underline underline-offset-4"
    >
      <Icon type="live" height="20" /><span>Live Stream</span>
    </a>
  </h2>
</div>
