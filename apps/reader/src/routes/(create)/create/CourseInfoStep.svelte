<script lang="ts">
  type Props = {
    courseName: string;
    lecturerName: string;
    onnext: () => void;
    onexit: () => void;
  };
  let { courseName = $bindable(), lecturerName = $bindable(), onnext, onexit }: Props = $props();
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
  <div class="flex justify-between">
    <button class="btn rounded-sm bg-surface-300 dark:bg-surface-600" type="button" onclick={onexit}>Exit</button>
    <button
      class="btn rounded-sm bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
      type="submit"
      disabled={courseName.trim().length === 0}>Next &rarr;</button
    >
  </div>
</form>
