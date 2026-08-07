<script lang="ts">
  import MediansView from "$lib/components/MediansView.svelte";
  import type { TutorsTimeCourse } from "@tutors/tutors-time-lib";

  interface Props {
    data: { course: TutorsTimeCourse | null };
  }

  let { data }: Props = $props();
</script>

<MediansView course={data.course} />
