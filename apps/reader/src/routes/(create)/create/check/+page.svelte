<script lang="ts">
  import type { Finding } from "@tutors/course-rules";
  import Findings from "../Findings.svelte";
  import { checkZip, UnreadableCourseError } from "../check";

  let findings = $state<Finding[] | null>(null);
  let error = $state("");
  let fileName = $state("");
  /** The latest choice: a slower check of an earlier .zip must not show under the later one's name. */
  let latest = 0;

  async function handleFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const choice = ++latest;
    fileName = file.name;
    findings = null;
    error = "";
    input.value = "";
    try {
      const result = await checkZip(new Uint8Array(await file.arrayBuffer()));
      if (choice === latest) findings = result;
    } catch (failure) {
      if (choice === latest) error = failure instanceof UnreadableCourseError ? failure.message : "This course couldn't be checked. Please try again.";
    }
  }
</script>

<div class="ui-page max-w-4xl">
  <div class="ui-panel space-y-6">
    <h1 class="ui-title">Check a Course</h1>
    <p class="ui-muted">
      Zip your course folder and choose the .zip. It is checked here in your browser and never uploaded. The checks are the same as
      <code>tutors validate</code> on the command line.
    </p>
    <label class="ui-button ui-button-primary" for="course-zip">Choose a .zip</label>
    <input id="course-zip" class="sr-only" type="file" accept=".zip,application/zip" onchange={handleFile} />
    {#if fileName}<p class="ui-muted">Checked {fileName}</p>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
    {#if findings}<Findings {findings} />{/if}
    <p><a href="/create">&larr; Create a new course instead</a></p>
  </div>
</div>
