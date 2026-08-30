<script lang="ts">
  import type { GeneratedFile } from "@tutors/tutors-create/generate";
  import FileTree from "./FileTree.svelte";

  type Props = {
    files: GeneratedFile[];
    courseId: string;
    onnext: () => void;
    onback: () => void;
  };
  let { files, courseId, onnext, onback }: Props = $props();
</script>

<div class="space-y-4">
  <div
    class="max-h-96 overflow-auto rounded-sm border border-surface-300 bg-surface-100 p-4 font-mono text-sm dark:border-surface-600 dark:bg-surface-800"
  >
    <FileTree {files} rootName={courseId} />
  </div>
  <div class="flex justify-between">
    <button class="btn rounded-sm bg-surface-300 dark:bg-surface-600" onclick={onback}>&larr; Back</button>
    <button class="btn rounded-sm bg-primary-500 text-white hover:bg-primary-600" onclick={onnext}>Generate &rarr;</button>
  </div>
</div>
