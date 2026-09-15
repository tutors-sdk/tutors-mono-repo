<script lang="ts">
  import LabsGrid from "$lib/components/labs/LabsGrid.svelte";
  import type { TutorsTimeCourse } from "@tutors/tutors-time-lib";

  interface Props {
    data: { course: TutorsTimeCourse | null };
  }

  let { data }: Props = $props();
</script>

<LabsGrid course={data.course} mode="lab" />
