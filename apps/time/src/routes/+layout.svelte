<script lang="ts">
  import "../app.css";

  import { onMount } from "svelte";
  import { themeService } from "@tutors/themes";
  import { goto } from "$app/navigation";
  import TutorsIcon from "@tutors/ui-primitives/components/TutorsIcon.svelte";
  import CourseCard from "$lib/components/CourseCard.svelte";
  import StudentCard from "$lib/components/StudentCard.svelte";
  import SentimentIcon from "$lib/components/SentimentIcon.svelte";
  import type { Sentiment } from "$lib/components/SentimentIcon.svelte";
  import ToastProvider from "@tutors/ui-primitives/components/ToastProvider.svelte";

  let { children, data } = $props();

  onMount(() => themeService.initDisplay());

  const title = $derived(data.courseTitle ?? "Tutors Time");
  const subtitle = $derived(data.viewType ?? "");
</script>

<header class="time-header">
  <a href="/" class="time-brand"><TutorsIcon widthPlease="38px" /><span class="sr-only">Tutors Time home</span></a>
  <div class="min-w-0 flex-1"><CourseCard {title} subtitle={subtitle || null} courseIcon={data.courseIcon ?? null} courseImg={data.courseImg ?? null} /></div>
  {#if data.studentName}<div class="hidden items-center gap-3 md:flex"><SentimentIcon sentiment={data.sentiment as Sentiment} /><StudentCard fullName={data.studentName} avatarUrl={data.avatarUrl} compact /></div>{/if}
  <div class="time-appearance">
    <select class="select" aria-label="Theme" value={themeService.currentTheme.value} onchange={(event) => themeService.setTheme(event.currentTarget.value)}>
      {#each themeService.themes as theme}<option value={theme.name}>{theme.name.charAt(0).toUpperCase() + theme.name.slice(1)}</option>{/each}
    </select>
    <select class="select" aria-label="Appearance" value={themeService.lightMode.value} onchange={(event) => themeService.setDisplayMode(event.currentTarget.value)}><option value="light">Light</option><option value="dark">Dark</option></select>
  </div>
  {#if data.courseId}<button type="button" class="ui-button" onclick={() => goto("/")}>Change course</button>{/if}
</header>
<ToastProvider />
<main id="main-content" class="time-app" tabindex="-1">{@render children()}</main>
<style>
  .time-app { min-height: calc(100dvh - 76px); background: var(--ui-canvas); }
  .time-header { flex-wrap: wrap; display: flex; align-items: center; gap: var(--space-4); min-height: 76px; padding: var(--space-3) var(--space-6); background: var(--ui-surface); border-bottom: 1px solid var(--ui-border); }
  .time-appearance { display: flex; gap: var(--space-2); max-width: 100%; }
  .time-appearance select { min-width: 0; width: 6rem; }
  .time-appearance select:first-child { width: 12rem; }
  .time-brand { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex-shrink: 0; border-radius: var(--radius-control); }
  @media (max-width: 600px) { .time-header { padding-inline: var(--space-3); gap: var(--space-3); } }
</style>
