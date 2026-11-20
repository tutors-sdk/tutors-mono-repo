<script lang="ts">
  import { onDestroy } from "svelte";
  import type { Finding } from "@tutors/course-rules";
  import { MAX_ZIP_BYTES } from "@tutors/course/validation";
  import Findings from "@tutors/ui-components/validation/Findings.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { fetchPublishedCourse, publishedCourseUrl } from "#lib/published.ts";
  import { runValidation } from "#lib/worker.ts";

  let address = $state("");
  let findings = $state<Finding[] | null>(null);
  let error = $state("");
  let busy = $state(false);
  let source = $state("");
  let mode = $state<"url" | "zip">("url");
  let zipInput: HTMLInputElement;
  let dragging = $state(false);
  let controller: AbortController | undefined;
  onDestroy(() => controller?.abort());

  function begin(name: string, kind: "url" | "zip") {
    controller?.abort();
    controller = new AbortController();
    source = name;
    mode = kind;
    findings = null;
    error = "";
    busy = true;
    return controller.signal;
  }

  async function checkUrl(event: SubmitEvent) {
    event.preventDefault();
    const signal = begin(address.trim(), "url");
    try {
      const url = publishedCourseUrl(address);
      source = url;
      const course = await fetchPublishedCourse(url, signal);
      const result = await runValidation({ course }, signal);
      if (!signal.aborted) findings = result;
    } catch (failure) {
      if (!signal.aborted) error = failure instanceof Error ? failure.message : "The course could not be checked.";
    } finally {
      if (!signal.aborted) busy = false;
    }
  }

  async function checkFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";
    await checkZipFile(file);
  }

  async function checkZipFile(file: File) {
    const signal = begin(file.name, "zip");
    try {
      if (file.size > MAX_ZIP_BYTES) throw new Error("This .zip is larger than 1 GB. Leave out generated output and dependency folders, then try again.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await runValidation({ bytes }, signal);
      if (!signal.aborted) findings = result;
    } catch (failure) {
      if (!signal.aborted) error = failure instanceof Error ? failure.message : "This file could not be checked. Choose a ZIP of the course source folder.";
    } finally {
      if (!signal.aborted) busy = false;
    }
  }

  function dropZip(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    if (files.length > 1) {
      begin("", "zip");
      busy = false;
      error = "Choose one course ZIP at a time.";
      return;
    }
    void checkZipFile(files[0]);
  }
</script>

<svelte:head
  ><title>Check a course · Tutors Validator</title><meta
    name="description"
    content="Find problems in a published Tutors course or check a course ZIP privately in your browser."
  /></svelte:head
>

<div class="ui-page validator-page">
  <header class="validator-heading">
    <p class="ui-eyebrow">Tutors Validator</p>
    <h1 class="ui-title">Check your course before students do.</h1>
    <p class="ui-muted">Find course data, enrollment, and source-file issues, with a path to each problem and advice on fixing it.</p>
  </header>

  <div class="input-options">
    <section class="ui-panel input-panel" aria-labelledby="url-heading">
      <Icon icon="lucide:link" height="24" />
      <h2 id="url-heading" class="ui-section-title">Published course</h2>
      <p class="ui-muted">Check the course data and enrollment students receive.</p>
      <form onsubmit={checkUrl}>
        <label for="course-url">Course URL or Netlify site name</label>
        <input
          id="course-url"
          class="input"
          type="text"
          inputmode="url"
          required
          bind:value={address}
          placeholder="https://my-course.netlify.app"
          spellcheck="false"
          aria-describedby="url-help"
        />
        <p id="url-help" class="ui-muted">A course host, a Tutors reader link, or a direct tutors.json URL.</p>
        <button class="ui-button ui-button-primary" type="submit">Check course URL</button>
      </form>
    </section>
    <section class="ui-panel input-panel" aria-labelledby="zip-heading">
      <Icon icon="lucide:folder-check" height="24" />
      <h2 id="zip-heading" class="ui-section-title">Course source ZIP</h2>
      <p class="ui-muted">Run the source checks used by <code>tutors validate</code>: folders, YAML, links, images, quizzes, and slides.</p>
      <div
        class="zip-dropzone"
        class:dragging
        role="region"
        aria-label="Course ZIP drop area"
        ondragover={(event) => {
          event.preventDefault();
          dragging = true;
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        }}
        ondragleave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dragging = false;
        }}
        ondrop={dropZip}
      >
        <Icon icon="lucide:upload" height="28" />
        <p class="drop-label">{dragging ? "Drop your course ZIP here" : "Drag your course ZIP here"}</p>
        <span class="ui-muted">or choose it from your device</span>
        <button class="ui-button ui-button-primary" type="button" onclick={() => zipInput.click()} aria-describedby="zip-help">Choose ZIP file</button>
        <input
          bind:this={zipInput}
          id="course-zip"
          hidden
          type="file"
          accept=".zip,application/zip"
          onchange={checkFile}
          aria-label="Choose a ZIP of your course folder"
          aria-describedby="zip-help"
        />
      </div>
      <p id="zip-help" class="ui-muted">Up to 1 GB compressed, with 100 MB of source text. ZIP contents stay in this browser and are never uploaded.</p>
    </section>
  </div>

  <section class="results" aria-label="Validation results" aria-busy={busy}>
    <div role="status" aria-live="polite">
      {#if busy}<p class="ui-section-title">Checking {source}…</p>
      {:else if findings}<p class="ui-muted">Checked {source}</p>{/if}
    </div>
    {#if error}<div class="read-error ui-panel" role="alert">
        <Icon icon="lucide:circle-alert" height="24" />
        <div>
          <h2 class="ui-section-title">Check could not be completed</h2>
          <p>{error}</p>
        </div>
      </div>{/if}
    {#if findings}
      <Findings {findings} scope={mode === "url" ? "published" : "source"} />
      <details class="scope-note">
        <summary>What was checked?</summary>
        <strong>{mode === "url" ? "Published data checked" : "Source files checked"}</strong>
        <p class="ui-muted">
          {mode === "url"
            ? "This checks the complete learning-object tree against the Tutors data schema, every quiz, and the course's properties, calendar, and enrollment. Upload a source ZIP to check folder names, missing source files, images, slides, and diagrams. Remote link and image availability are not tested."
            : "All source rules run locally across the course tree, including enrollment, folders, required files, links, local images, quiz questions, Marp slides, and Mermaid syntax. Remote link availability is not tested."}
        </p>
      </details>
    {/if}
  </section>
</div>

<style>
  .validator-page {
    max-width: 1120px;
  }
  .validator-heading {
    max-width: 720px;
    margin-bottom: var(--space-8);
  }
  .validator-heading h1 {
    margin-block: var(--space-3);
  }
  .input-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-6);
  }
  .input-panel {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--space-3);
  }
  form {
    display: grid;
    gap: var(--space-3);
    width: 100%;
    margin-top: var(--space-3);
  }
  .input {
    width: 100%;
    min-width: 0;
  }
  .zip-dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-6);
    border: 2px dashed var(--ui-border);
    border-radius: var(--radius-control);
    background: var(--ui-canvas);
    text-align: center;
    transition:
      border-color 150ms,
      background 150ms;
  }
  .zip-dropzone.dragging,
  .zip-dropzone:focus-within {
    border-color: var(--ui-brand);
    background: var(--ui-selected);
  }
  .drop-label {
    font-weight: var(--weight-medium);
  }
  .zip-dropzone button {
    min-height: 44px;
  }
  @media (prefers-reduced-motion: reduce) {
    .zip-dropzone {
      transition: none;
    }
  }
  label {
    font-weight: var(--weight-medium);
  }
  .results {
    margin-top: var(--space-8);
    overflow-wrap: anywhere;
  }
  .read-error {
    display: flex;
    gap: var(--space-3);
    border-left: 4px solid var(--ui-danger);
  }
  .read-error h2 {
    margin-bottom: var(--space-2);
  }
  .scope-note {
    margin-top: var(--space-4);
  }
  .scope-note summary {
    cursor: pointer;
    color: var(--ui-muted);
    padding-block: var(--space-3);
  }
  .scope-note p {
    margin-top: var(--space-2);
  }
  @media (max-width: 767px) {
    .input-options {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
