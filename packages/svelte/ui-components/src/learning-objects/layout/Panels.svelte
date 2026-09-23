<script lang="ts">
  import { rbacService } from "@tutors/rbac";
  import type { Panels } from "@tutors/tutors-model-lib";
  import Note from "../content/Note.svelte";
  import TalkClient from "../content/talk/TalkClient.svelte";
  import Video from "../content/Video.svelte";
  import Podcast from "../content/Podcast.svelte";

  interface Props {
    panels: Panels;
  }
  let { panels }: Props = $props();
</script>

<div class="panel-stack">
{#each (panels?.panelPodcasts ?? []).filter(lo => rbacService.isLoVisibleToStudent(lo)) as lo}
  <Podcast {lo} />
{/each}

{#each (panels?.panelVideos ?? []).filter(lo => rbacService.isLoVisibleToStudent(lo)) as lo}
  <Video {lo} />
{/each}
{#each (panels?.panelTalks ?? []).filter(lo => rbacService.isLoVisibleToStudent(lo)) as lo}
  <TalkClient {lo} />
{/each}
{#each (panels?.panelNotes ?? []).filter(lo => rbacService.isLoVisibleToStudent(lo)) as lo}
  <Note {lo} />
{/each}

</div>
<style>
  .panel-stack { display: grid; gap: var(--space-4); min-width: 0; }
  /* :empty never matches (template whitespace), so key the spacing on actual panels. */
  .panel-stack:has(> *) { margin-bottom: var(--space-4); }
</style>
