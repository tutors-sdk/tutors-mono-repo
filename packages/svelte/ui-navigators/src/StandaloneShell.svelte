<script lang="ts">
  /**
   * Root layout shell for the apps that are not the course reader
   * (catalogue, live). Clears any current course, applies the stored
   * theme once on the client, and renders TutorsShell without the
   * connect controls. Apps keep only their title and global CSS import.
   */
  import TutorsShell from "./TutorsShell.svelte";
  import { currentCourse } from "@tutors/runes";
  import { themeService } from "@tutors/themes";
  import { browser } from "$app/environment";
  import type { Snippet } from "svelte";

  type Props = { title: string; children: Snippet };
  let { title, children }: Props = $props();

  currentCourse.value = null;

  if (browser) {
    themeService.initDisplay();
  }
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<TutorsShell showConnect={false}>
  {@render children()}
</TutorsShell>
