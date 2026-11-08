<script lang="ts">
  import type { Finding } from "@tutors/course-rules";
  import type { GeneratedFile } from "@tutors/tutors-create/generate";
  import FileTree from "./FileTree.svelte";
  import Findings from "./Findings.svelte";

  type Props = {
    files: GeneratedFile[];
    courseId: string;
    /** What tutors validate says about these files; null while the check runs. */
    findings: Finding[] | null;
    onnext: () => void;
    onback: () => void;
  };
  let { files, courseId, findings, onnext, onback }: Props = $props();
</script>

<div class="space-y-4">
  <div class="ui-panel max-h-96 overflow-auto font-mono text-sm">
    <FileTree {files} rootName={courseId} />
  </div>
  {#if findings === null}
    <p class="ui-muted">Checking the course…</p>
  {:else}
    <Findings {findings} />
  {/if}
  <div class="flex justify-between">
    <button class="ui-button" onclick={onback}>&larr; Back</button>
    <button class="ui-button ui-button-primary" onclick={onnext}>Generate &rarr;</button>
  </div>
</div>
