<script lang="ts">
  import { page } from "$app/stores";
  import Navigation from "$lib/components/Navigation.svelte";

  let { children } = $props();

  const courseId = $derived(($page.params.courseid as string) ?? "");
</script>

<div class="flex h-[calc(100vh-4rem)] min-h-0">
  <Navigation {courseId} />
  <div class="flex-1 min-w-0 min-h-0 flex flex-col overflow-auto p-2">
    {@render children()}
  </div>
</div>
