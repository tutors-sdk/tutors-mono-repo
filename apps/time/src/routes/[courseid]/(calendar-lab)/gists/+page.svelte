<script lang="ts">
  import GistsTable from "$lib/components/tables/GistsTable.svelte";
  import { page } from "$app/stores";
  import { invalidateAll } from "$app/navigation";
  import { onGistCreated } from "@tutors/community";
  import { onDestroy } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const courseId = $derived(($page.params.courseid as string) ?? "");

  // Live updates: the realtime ping is deliberately content-free, so the only
  // thing to do on arrival is re-run the authorised server load.
  let stop: (() => void) | null = null;
  $effect(() => {
    const id = courseId.trim();
    if (!id || !data.authorised) return;
    stop = onGistCreated(id, () => void invalidateAll());
    return () => {
      stop?.();
      stop = null;
    };
  });
  onDestroy(() => stop?.());

  const deniedMessage = $derived(
    data.reason === "anonymous"
      ? "Sign in with GitHub to view snippets shared with this course."
      : data.reason === "no-enrollment"
        ? "This course has no enrollment.yaml, so it has no educators. Add one to use snippet sharing."
        : "Your GitHub account is not listed as an educator of this course."
  );
</script>

<svelte:head>
  <title>Shared snippets</title>
  <meta name="description" content="Ephemeral snippets students have shared, auto-deleting after 48 hours" />
</svelte:head>

{#key courseId}
  <section class="p-2 h-[calc(100vh-4rem)]">
    <div class="card p-4 h-full flex flex-col">
      {#if !data.authorised}
        <div class="flex flex-col items-center justify-center flex-1 text-center gap-3">
          <h1 class="text-xl font-bold">Educators only</h1>
          <p class="text-surface-600 max-w-prose">{deniedMessage}</p>
          {#if data.reason === "anonymous"}
            <a href="/auth/signin" class="btn preset-filled">Sign in with GitHub</a>
          {/if}
        </div>
      {:else}
        <div class="flex flex-col flex-1 min-h-0 overflow-auto">
          <GistsTable rows={data.rows} error={data.error ?? null} />
        </div>
      {/if}
    </div>
  </section>
{/key}
