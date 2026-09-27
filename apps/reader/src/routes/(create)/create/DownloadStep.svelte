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
    <p class="ui-section-title">Your course is ready!</p>
    <p class="ui-muted">
      Click below to download your editable course as a <code>.zip</code> of Markdown source.
    </p>
    <button
      class="ui-button ui-button-primary"
      onclick={ondownload}>Download {courseId}.zip</button
    >
  {:else}
    <p class="ui-section-title text-[var(--ui-success)]">Downloaded!</p>
    <div
      class="ui-panel prose prose-sm dark:prose-invert max-w-none text-left"
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
    <button class="ui-button ui-button-primary" onclick={ondownload}
      >Download Again</button
    >
  {/if}
  <div class="flex justify-start">
    <button class="ui-button" onclick={onback}>&larr; Back</button>
  </div>
</div>
