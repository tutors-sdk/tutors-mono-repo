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
  let downloaded = $state(false);

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
    includeLabs
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
    downloadCourseZip(files, courseId);
    downloaded = true;
  }
</script>

<div class="container mx-auto max-w-3xl p-4">
  <div class="card m-4 space-y-6 p-6">
    <h2 class="h2 text-center">Create a New Course</h2>

    <StepIndicator {steps} current={currentStep} onjump={(i) => (currentStep = i)} />

    <div class="mt-6">
      {#if currentStep === 0}
        <CourseInfoStep bind:courseName bind:lecturerName onnext={submitInfo} onexit={() => goto("/")} />
      {:else if currentStep === 1}
        <StructureStep
          bind:unitCount
          bind:topicsPerUnit
          bind:includeSide
          bind:includeNotes
          bind:includeLabs
          onnext={next}
          onback={back}
        />
      {:else if currentStep === 2}
        <PreviewStep {files} {courseId} onnext={next} onback={back} />
      {:else if currentStep === 3}
        <DownloadStep {courseId} steps={downloadSteps} {downloaded} ondownload={handleDownload} onback={back} />
      {/if}
    </div>
  </div>
</div>
