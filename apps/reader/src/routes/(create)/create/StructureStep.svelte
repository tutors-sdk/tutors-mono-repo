<script lang="ts">
  type Props = {
    unitCount: number;
    topicsPerUnit: number;
    includeSide: boolean;
    includeNotes: boolean;
    includeLabs: boolean;
    includeCalendar: boolean;
    includeEnrollment: boolean;
    includeGitignore: boolean;
    includeReadme: boolean;
    readmeDescription: string;
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
    includeGitignore = $bindable(),
    includeReadme = $bindable(),
    readmeDescription = $bindable(),
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
    <label class="ui-label" for="unitCount">Number of Units</label>
    <input id="unitCount" class="input w-full" type="number" required
      min="1" max="12" bind:value={unitCount} />
    <p class="mt-1 text-sm ui-muted">
      Units are the sections shown on the course home page (like weeks or modules).
    </p>
  </div>
  <div>
    <label class="ui-label" for="topicsPerUnit">Topics per Unit</label>
    <input
      id="topicsPerUnit"
      class="input w-full"
      type="number"
      required
      min="1"
      max="12"
      bind:value={topicsPerUnit}
    />
    <p class="mt-1 text-sm ui-muted">
      Each topic gets a talk (with a starter Marp deck), and optionally a note and a lab.
    </p>
  </div>
  <div class="flex flex-col gap-3">
    <label class="flex min-h-11 items-center gap-3">
      <input type="checkbox" bind:checked={includeSide} />
      <span class="font-medium">Include a Side unit</span>
    </label>
    <label class="flex min-h-11 items-center gap-3">
      <input type="checkbox" bind:checked={includeNotes} />
      <span class="font-medium">Include a note in each topic</span>
    </label>
    <label class="flex min-h-11 items-center gap-3">
      <input type="checkbox" bind:checked={includeLabs} />
      <span class="font-medium">Include a lab in each topic</span>
    </label>
    <label class="flex min-h-11 items-center gap-3">
      <input type="checkbox" bind:checked={includeCalendar} />
      <span class="font-medium">Include a calendar</span>
    </label>
    <label class="flex min-h-11 items-center gap-3">
      <input type="checkbox" bind:checked={includeEnrollment} />
      <span class="font-medium">Include an enrollment list</span>
    </label>
  </div>
  <p class="text-sm ui-muted">
    The Side unit holds a talk and a note displayed in the sidebar. Labs are hands-on exercises with numbered steps.
    The calendar is a week-by-week schedule seeded from today; the enrollment list (disabled by default) makes the
    course private.
  </p>

  <div class="border-t border-[var(--ui-border)] pt-4">
    <h3 class="ui-section-title mb-3">Repository files</h3>
    <div class="flex flex-col gap-3">
      <label class="flex min-h-11 items-center gap-3">
        <input type="checkbox" bind:checked={includeGitignore} />
        <span class="font-medium">Include a .gitignore</span>
      </label>
      <label class="flex min-h-11 items-center gap-3">
        <input type="checkbox" bind:checked={includeReadme} />
        <span class="font-medium">Include a README</span>
      </label>
      {#if includeReadme}
        <div>
          <label class="ui-label" for="readmeDescription">README description</label>
          <textarea
            id="readmeDescription"
            class="input w-full resize-y"
            rows="3"
            placeholder="A sentence or two about this course, shown at the top of the README."
            bind:value={readmeDescription}
          ></textarea>
        </div>
      {/if}
    </div>
    <p class="mt-3 text-sm ui-muted">
      The .gitignore keeps the generated site, editor and OS files out of Git. The README is the landing page anyone
      sees when they open the course repository on GitHub.
    </p>
  </div>
  <div class="flex justify-between">
    <button class="ui-button" type="button" onclick={onback}>&larr; Back</button>
    <button class="ui-button ui-button-primary" type="submit">Next &rarr;</button>
  </div>
</form>
