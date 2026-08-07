<script lang="ts">
  import "../app.css";
  import { AppBar } from "@skeletonlabs/skeleton-svelte";
  import { goto } from "$app/navigation";
  import CourseCard from "$lib/components/CourseCard.svelte";
  import StudentCard from "$lib/components/StudentCard.svelte";
  import SentimentIcon from "$lib/components/SentimentIcon.svelte";
  import type { Sentiment } from "$lib/components/SentimentIcon.svelte";

  let { children, data } = $props();

  const title = $derived(data.courseTitle ?? "Tutors Time");
  const subtitle = $derived(data.viewType ?? "");
</script>

<AppBar>
  <AppBar.Toolbar class="grid-cols-[1fr_2fr_1fr] h-16 min-h-16">
    <AppBar.Lead class="justify-start">

      <CourseCard
      {title}
      subtitle={subtitle || null}
      courseIcon={data.courseIcon ?? null}
      courseImg={data.courseImg ?? null}
    />
    </AppBar.Lead>
    <AppBar.Headline class="h-full min-w-0">

    </AppBar.Headline>
    <AppBar.Trail class="justify-end">
      {#if data.studentName}
        <div class="flex items-center gap-8">
          <SentimentIcon sentiment={data.sentiment as Sentiment} />
          <StudentCard fullName={data.studentName} avatarUrl={data.avatarUrl} compact />
        </div>
      {/if}
      {#if data.courseId}
      <button
        type="button"
        class="btn preset-outlined text-center leading-tight"
        onclick={() => goto("/")}
        aria-label="Change course"
      >
        Change<br />Course
      </button>
    {/if}
    </AppBar.Trail>
  </AppBar.Toolbar>
</AppBar>

<main>
  {@render children()}
</main>
