<script lang="ts">
  import { goto } from "$app/navigation";
  import { generateCourseFiles, nextSteps, slugify, type CourseSpec } from "@tutors/tutors-create/generate";
  import { downloadCourseZip } from "./download";
  import StepIndicator from "./StepIndicator.svelte";
  import CourseInfoStep from "./CourseInfoStep.svelte";
  import StructureStep from "./StructureStep.svelte";
  import PreviewStep from "./PreviewStep.svelte";
  import DownloadStep from "./DownloadStep.svelte";

  let currentStep = $state(0);
  let courseName = $state("");
  let lecturerName = $state("");
  let courseId = $state("");
  let unitCount = $state(2);
  let includeSide = $state(true);
  let topicsPerUnit = $state(3);
  let includeNotes = $state(true);
  let includeLabs = $state(true);
  let includeCalendar = $state(false);
  let includeEnrollment = $state(false);
  let includeGitignore = $state(true);
  let includeReadme = $state(false);
  let readmeDescription = $state("");
  let downloaded = $state(false);
  let downloadError = $state("");

  const steps = ["Course Info", "Structure", "Preview", "Download"];

  // The single source of truth: the same spec the CLI scaffolder consumes.
  const spec = $derived<CourseSpec>({
    courseName,
    lecturerName,
    courseId,
    unitCount,
    includeSide,
    topicsPerUnit,
    includeNotes,
    includeLabs,
    includeCalendar,
    includeEnrollment,
    includeGitignore,
    includeReadme,
    readmeDescription
  });

  // Preview and download are both derived from the shared scaffolder output,
  // so they can never diverge.
  const files = $derived(generateCourseFiles(spec));

  // Identical to the CLI's next-steps: both render the shared nextSteps(spec).
  const downloadSteps = $derived(nextSteps(spec));

  function next() {
    if (currentStep < steps.length - 1) currentStep++;
  }
  function back() {
    if (currentStep > 0) currentStep--;
  }

  function submitInfo() {
    courseId = slugify(courseName) || "my-new-course";
    next();
  }

  function handleDownload() {
    downloadError = "";
    try {
      downloadCourseZip(files, courseId, spec);
      downloaded = true;
    } catch {
      downloadError = "The download could not be prepared. Please try again.";
    }
  }

  function handleImport(imported: import("@tutors/tutors-create/generate").CourseSpec) {
    courseName = imported.courseName;
    lecturerName = imported.lecturerName;
    courseId = imported.courseId || slugify(imported.courseName) || "my-new-course";
    unitCount = imported.unitCount;
    topicsPerUnit = imported.topicsPerUnit;
    includeSide = imported.includeSide;
    includeNotes = imported.includeNotes;
    includeLabs = imported.includeLabs;
    includeCalendar = imported.includeCalendar ?? false;
    includeEnrollment = imported.includeEnrollment ?? false;
    includeGitignore = imported.includeGitignore ?? true;
    includeReadme = imported.includeReadme ?? false;
    readmeDescription = imported.readmeDescription ?? "";
  }
</script>

<div class="ui-page max-w-4xl">
  <div class="ui-panel space-y-6">
    <h1 class="ui-title">Create a New Course</h1>

    <StepIndicator {steps} current={currentStep} onjump={(i) => (currentStep = i)} />

    <div class="mt-6">
      {#if currentStep === 0}
        <CourseInfoStep bind:courseName bind:lecturerName onnext={submitInfo} onexit={() => goto("/")} onimport={handleImport} />
      {:else if currentStep === 1}
        <StructureStep
          bind:unitCount
          bind:topicsPerUnit
          bind:includeSide
          bind:includeNotes
          bind:includeLabs
          bind:includeCalendar
          bind:includeEnrollment
          bind:includeGitignore
          bind:includeReadme
          bind:readmeDescription
          onnext={next}
          onback={back}
        />
      {:else if currentStep === 2}
        <PreviewStep {files} {courseId} onnext={next} onback={back} />
      {:else if currentStep === 3}
        {#if downloadError}<p role="alert">{downloadError}</p>{/if}
        <DownloadStep {courseId} steps={downloadSteps} {downloaded} ondownload={handleDownload} onback={back} />
      {/if}
    </div>
  </div>
</div>
