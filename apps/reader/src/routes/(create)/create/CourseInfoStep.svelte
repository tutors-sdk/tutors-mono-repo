<script lang="ts">
  import { defaultSpec, type CourseSpec } from "@tutors/tutors-create/generate";

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
        const imported = JSON.parse(reader.result as string);
        if (!imported || typeof imported !== "object" || Array.isArray(imported)) throw new Error("Invalid course");
        const spec = { ...defaultSpec, ...imported } as CourseSpec;
        if (typeof spec.courseName !== "string" || !spec.courseName.trim() ||
            [spec.unitCount, spec.topicsPerUnit].some(value => !Number.isInteger(value) || value < 1 || value > 12) ||
            [spec.lecturerName, spec.courseId, spec.readmeDescription].some(value => typeof value !== "string") ||
            [spec.includeSide, spec.includeNotes, spec.includeLabs, spec.includeCalendar, spec.includeEnrollment, spec.includeGitignore, spec.includeReadme].some(value => typeof value !== "boolean")) {
          importError = "Invalid course.json — check the course name, options and unit/topic counts (1–12).";
          return;
        }
        onimport(spec);
      } catch {
        importError = "Could not parse file as JSON.";
      }
    };
    reader.onerror = () => { importError = "Could not read this file. Please try again."; };
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
    <label class="ui-label" for="courseName"
      >Course Name <span class="text-[var(--ui-danger)]">*</span></label
    >
    <input
      id="courseName"
      class="input w-full"
      type="text"
      placeholder="e.g. Web Development Fundamentals"
      bind:value={courseName}
      required
    />
    <p class="mt-1 text-sm ui-muted">This becomes the main heading and title of your course.</p>
  </div>
  <div>
    <label class="ui-label" for="lecturerName">Your Name</label>
    <input
      id="lecturerName"
      class="input w-full"
      type="text"
      placeholder="e.g. Dr. Jane Smith"
      bind:value={lecturerName}
    />
    <p class="mt-1 text-sm ui-muted">Appears in the course description. Optional.</p>
  </div>

  <div class="ui-empty text-center">
    <p class="mb-2 text-sm ui-muted">Have an existing course.json? Import it to pre-fill all fields.</p>
    <input type="file" accept=".json" class="hidden" bind:this={fileInput} onchange={handleFileSelect} />
    <button
      class="ui-button"
      type="button"
      onclick={() => fileInput.click()}>Import course.json</button
    >
    {#if importError}
      <p role="alert" class="mt-2 text-sm text-[var(--ui-danger)]">{importError}</p>
    {/if}
  </div>

  <div class="flex justify-between">
    <button class="ui-button" type="button" onclick={onexit}>Exit</button>
    <button
      class="ui-button ui-button-primary"
      type="submit"
      disabled={courseName.trim().length === 0}>Next &rarr;</button
    >
  </div>
</form>
