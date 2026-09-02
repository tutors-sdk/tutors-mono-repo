<script lang="ts">
  import type { CourseSpec } from "@tutors/tutors-create/generate";

  type Props = {
    courseName: string;
    lecturerName: string;
    onnext: () => void;
    onexit: () => void;
    onimport: (spec: CourseSpec) => void;
  };
  let { courseName = $bindable(), lecturerName = $bindable(), onnext, onexit, onimport }: Props = $props();

  let fileInput: HTMLInputElement;
  let importError = $state("");

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    importError = "";
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const spec = JSON.parse(reader.result as string) as CourseSpec;
        if (!spec.courseName || typeof spec.unitCount !== "number") {
          importError = "Invalid course.json — missing required fields.";
          return;
        }
        onimport(spec);
      } catch {
        importError = "Could not parse file as JSON.";
      }
    };
    reader.readAsText(file);
    input.value = "";
  }
</script>

<form
  class="space-y-6"
  onsubmit={(e) => {
    e.preventDefault();
    onnext();
  }}
>
  <div>
    <label class="label mb-1 font-semibold" for="courseName"
      >Course Name <span class="text-error-500">*</span></label
    >
    <input
      id="courseName"
      class="input w-full rounded-sm"
      type="text"
      placeholder="e.g. Web Development Fundamentals"
      bind:value={courseName}
      required
    />
    <p class="mt-1 text-sm text-surface-500">This becomes the main heading and title of your course.</p>
  </div>
  <div>
    <label class="label mb-1 font-semibold" for="lecturerName">Your Name</label>
    <input
      id="lecturerName"
      class="input w-full rounded-sm"
      type="text"
      placeholder="e.g. Dr. Jane Smith"
      bind:value={lecturerName}
    />
    <p class="mt-1 text-sm text-surface-500">Appears in the course description. Optional.</p>
  </div>

  <div class="rounded-sm border border-dashed border-surface-400 p-4 text-center dark:border-surface-500">
    <p class="mb-2 text-sm text-surface-500">Have an existing course.json? Import it to pre-fill all fields.</p>
    <input type="file" accept=".json" class="hidden" bind:this={fileInput} onchange={handleFileSelect} />
    <button
      class="btn rounded-sm bg-surface-300 dark:bg-surface-600"
      type="button"
      onclick={() => fileInput.click()}>Import course.json</button
    >
    {#if importError}
      <p class="mt-2 text-sm text-error-500">{importError}</p>
    {/if}
  </div>

  <div class="flex justify-between">
    <button class="btn rounded-sm bg-surface-300 dark:bg-surface-600" type="button" onclick={onexit}>Exit</button>
    <button
      class="btn rounded-sm bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
      type="submit"
      disabled={courseName.trim().length === 0}>Next &rarr;</button
    >
  </div>
</form>
