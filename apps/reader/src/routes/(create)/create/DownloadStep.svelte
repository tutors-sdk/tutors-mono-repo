<script lang="ts">
  type Props = {
    courseId: string;
    steps: string[];
    downloaded: boolean;
    ondownload: () => void;
    onback: () => void;
  };
  let { courseId, steps, downloaded, ondownload, onback }: Props = $props();

  // Split a step into text / URL / code segments so URLs become active links
  // and the deno command and `json` render as bold code.
  const partRegex = /(https?:\/\/\S+|deno run -A jsr:@tutors\/tutors|\bjson\b)/g;
  function segments(step: string): { text: string; isUrl: boolean; isCode: boolean }[] {
    return step
      .split(partRegex)
      .filter((part) => part.length > 0)
      .map((part) => ({
        text: part,
        isUrl: /^https?:\/\//.test(part),
        isCode: part === "deno run -A jsr:@tutors/tutors" || part === "json"
      }));
  }
</script>

<div class="space-y-6 text-center">
  {#if !downloaded}
    <p class="text-lg font-semibold">Your course is ready!</p>
    <p class="text-surface-500">
      Click below to download your editable course as a <code class="code">.zip</code> of Markdown source.
    </p>
    <button
      class="btn rounded-sm bg-primary-500 px-8 py-3 text-lg text-white hover:bg-primary-600"
      onclick={ondownload}>Download {courseId}.zip</button
    >
  {:else}
    <p class="text-lg font-semibold text-success-600 dark:text-success-400">Downloaded!</p>
    <div
      class="prose prose-sm dark:prose-invert max-w-none rounded-sm border border-surface-300 bg-surface-100 p-4 text-left dark:border-surface-600 dark:bg-surface-800"
    >
      <p><strong>Next steps:</strong></p>
      <ol>
        {#each steps as step}
          <li>
            {#each segments(step) as seg}
              {#if seg.isUrl}
                <a href={seg.text} target="_blank" rel="noopener noreferrer">{seg.text}</a>
              {:else if seg.isCode}
                <strong><code>{seg.text}</code></strong>
              {:else}{seg.text}{/if}
            {/each}
          </li>
        {/each}
      </ol>
    </div>
    <button class="btn rounded-sm bg-primary-500 text-white hover:bg-primary-600" onclick={ondownload}
      >Download Again</button
    >
  {/if}
  <div class="flex justify-start">
    <button class="btn rounded-sm bg-surface-300 dark:bg-surface-600" onclick={onback}>&larr; Back</button>
  </div>
</div>
