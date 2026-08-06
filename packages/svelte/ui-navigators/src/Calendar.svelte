<script lang="ts">
  import type { Calendar } from "@tutors/tutors-model-lib";
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  interface Props {
    calendar: Calendar;
  }
  let { calendar }: Props = $props();
</script>

<h4 class="mb-4 text-center font-semibold">{calendar.title}</h4>
<table class="w-full table-auto">
  <thead>
    <tr>
      <th class="mb-1 text-center">Week No.</th>
      <th class="mb-1 text-center">Type</th>
      <th class="mb-1 text-center">Date Starts</th>
    </tr>
  </thead>
  <tbody class="text-center">
    {#each calendar.weeks as week}
      {#if calendar?.currentWeek?.title == week.title}
        <tr class="my-2" style="background-color: light-dark(var(--color-success-300), var(--color-success-700));">
          <td>{week.title}</td>
          <td>{week.type}</td>
          <td>{monthNames[week.dateObj.getMonth()]} {week.dateObj.getDate()}</td>
        </tr>
      {:else}
        <tr class="hover my-2">
          <td>{week.title}</td>
          <td>{week.type}</td>
          <td>{monthNames[week.dateObj.getMonth()]} {week.dateObj.getDate()}</td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>
