<script lang="ts">
  import { browser } from "$app/environment";
  import { currentCourse } from "@tutors/runes";
  import TalkAdobe from "./TalkAdobe.svelte";
  import type { Talk } from "@tutors/tutors-model-lib";
  import { isMarpContent } from "@tutors/course/markdown";

  interface Props {
    lo: Talk;
    orientation?: "landscape" | "portrait";
  }
  let { lo, orientation = "landscape" }: Props = $props();

  let readerOverride = $state<string | null>(null);
  const useMozilla = $derived((readerOverride ?? currentCourse.value?.defaultPdfReader) === "mozilla");
  const isMarp = $derived(isMarpContent(lo));
</script>

{#if !isMarp}
  <div class="ui-actions mb-4">
    <!-- On phones the label is read, not shown, so the picker and "Open original" share one row. -->
    <label class="ui-actions text-sm"><span class="sr-only sm:not-sr-only">PDF reader</span>
      <select class="select w-auto" value={useMozilla ? "mozilla" : "adobe"} onchange={(event) => readerOverride = event.currentTarget.value}>
        <option value="adobe">Adobe</option><option value="mozilla">Browser reader</option>
      </select>
    </label>
    <a class="ui-button ml-auto" href={lo.pdf} target="_blank" rel="noopener noreferrer">Open original ↗</a>
  </div>
{/if}
{#if isMarp && browser}
  {#await import("./TalkMarp.svelte")}
    <div class="flex min-h-64 items-center justify-center">
      <p role="status" class="ui-muted">Loading presentation…</p>
    </div>
  {:then { default: TalkMarp }}
    <TalkMarp {lo} />
  {/await}
{:else if useMozilla && browser}
  {#await import("./TalkMozilla.svelte")}
    <div class="flex min-h-64 items-center justify-center">
      <p role="status" class="ui-muted">Loading presentation…</p>
    </div>
  {:then { default: TalkMozilla }}
    <TalkMozilla {lo} />
  {/await}
{:else if useMozilla && !browser}
  <div class="flex min-h-64 items-center justify-center">
    <p role="status" class="ui-muted">Loading presentation…</p>
  </div>
{:else}
  <TalkAdobe {lo} {orientation} />
{/if}
