<script lang="ts">
  type Props = {
    unitCount: number;
    topicsPerUnit: number;
    includeSide: boolean;
    includeNotes: boolean;
    includeLabs: boolean;
    includeCalendar: boolean;
    includeEnrollment: boolean;
    onnext: () => void;
    onback: () => void;
  };
  let {
    unitCount = $bindable(),
    topicsPerUnit = $bindable(),
    includeSide = $bindable(),
    includeNotes = $bindable(),
    includeLabs = $bindable(),
    includeCalendar = $bindable(),
    includeEnrollment = $bindable(),
    onnext,
    onback
  }: Props = $props();
</script>

<form
  class="space-y-6"
  onsubmit={(e) => {
    e.preventDefault();
    onnext();
  }}
>
  <div>
    <label class="label mb-1 font-semibold" for="unitCount">Number of Units</label>
    <input id="unitCount" class="input w-full rounded-sm" type="number" min="1" max="12" bind:value={unitCount} />
    <p class="mt-1 text-sm text-surface-500">
      Units are the sections shown on the course home page (like weeks or modules).
    </p>
  </div>
  <div>
    <label class="label mb-1 font-semibold" for="topicsPerUnit">Topics per Unit</label>
    <input
      id="topicsPerUnit"
      class="input w-full rounded-sm"
      type="number"
      min="1"
      max="12"
      bind:value={topicsPerUnit}
    />
    <p class="mt-1 text-sm text-surface-500">
      Each topic gets a talk (with a starter Marp deck), and optionally a note and a lab.
    </p>
  </div>
  <div class="flex flex-col gap-3">
    <label class="flex items-center gap-2">
      <input type="checkbox" class="checkbox" bind:checked={includeSide} />
      <span class="font-semibold">Include a Side unit</span>
    </label>
    <label class="flex items-center gap-2">
      <input type="checkbox" class="checkbox" bind:checked={includeNotes} />
      <span class="font-semibold">Include a note in each topic</span>
    </label>
    <label class="flex items-center gap-2">
      <input type="checkbox" class="checkbox" bind:checked={includeLabs} />
      <span class="font-semibold">Include a lab in each topic</span>
    </label>
    <label class="flex items-center gap-2">
      <input type="checkbox" class="checkbox" bind:checked={includeCalendar} />
      <span class="font-semibold">Include a calendar</span>
    </label>
    <label class="flex items-center gap-2">
      <input type="checkbox" class="checkbox" bind:checked={includeEnrollment} />
      <span class="font-semibold">Include an enrollment list</span>
    </label>
  </div>
  <p class="text-sm text-surface-500">
    The Side unit holds a talk and a note displayed in the sidebar. Labs are hands-on exercises with numbered steps.
    The calendar is a week-by-week schedule seeded from today; the enrollment list (disabled by default) makes the
    course private.
  </p>
  <div class="flex justify-between">
    <button class="btn rounded-sm bg-surface-300 dark:bg-surface-600" type="button" onclick={onback}>&larr; Back</button>
    <button class="btn rounded-sm bg-primary-500 text-white hover:bg-primary-600" type="submit">Next &rarr;</button>
  </div>
</form>
