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
    class="ui-panel max-h-96 overflow-auto font-mono text-sm"
  >
    <FileTree {files} rootName={courseId} />
  </div>
  <div class="flex justify-between">
    <button class="ui-button" onclick={onback}>&larr; Back</button>
    <button class="ui-button ui-button-primary" onclick={onnext}>Generate &rarr;</button>
  </div>
</div>
