<script lang="ts">
  import type { NowSnapshot } from "@tutors/live-store";
  import { count, loLabel } from "$lib/format";

  /** The "Now" layer: who is active this minute, and on what. */
  interface Props {
    snapshot: NowSnapshot | null;
    /** How many courses to list before collapsing into a count. */
    limit?: number;
  }
  let { snapshot, limit = 8 }: Props = $props();

  const courses = $derived(snapshot?.courses.slice(0, limit) ?? []);
  const remaining = $derived(Math.max(0, (snapshot?.courses.length ?? 0) - courses.length));
</script>

<section class="card preset-filled-surface-100-900 flex min-w-0 flex-col gap-3 p-4">
  <h2 class="text-base font-semibold">Active now</h2>
  {#if !snapshot}
    <p class="text-surface-600-400 py-4 text-center text-sm">Connecting to the live stream...</p>
  {:else if snapshot.courses.length === 0}
    <p class="text-surface-600-400 py-4 text-center text-sm">Nobody is reading right now.</p>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each courses as course (course.course)}
        <li class="border-surface-200-800 flex flex-col gap-1 border-b pb-2 last:border-b-0 last:pb-0">
          <div class="flex items-baseline justify-between gap-2">
            <a class="anchor truncate text-sm font-medium" href="/course/{course.course}">{course.course}</a>
            <span class="badge preset-filled-success-500 shrink-0">{count(course.active)}</span>
          </div>
          {#if course.los.length > 0}
            <p class="text-surface-600-400 truncate text-xs" title={course.los.map((lo) => lo.lo).join(", ")}>
              {course.los
                .slice(0, 3)
                .map((lo) => `${loLabel(lo.lo)} (${lo.count})`)
                .join(" · ")}
            </p>
          {/if}
        </li>
      {/each}
    </ul>
    {#if remaining > 0}
      <p class="text-surface-600-400 text-xs">and {remaining} more course{remaining === 1 ? "" : "s"}</p>
    {/if}
  {/if}

  {#if snapshot && snapshot.services.length > 0}
    <div class="flex flex-wrap gap-1 pt-1">
      {#each snapshot.services as service (service.service)}
        <span class="badge preset-tonal-primary text-xs">{service.service} {service.count}</span>
      {/each}
    </div>
  {/if}
</section>
