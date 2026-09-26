<script lang="ts">
  import "../app.css";

  import { onMount } from "svelte";
  import { themeService } from "@tutors/themes";
  import TutorsShell from "@tutors/ui-navigators/TutorsShell.svelte";
  import Navigation from "$lib/components/Navigation.svelte";

  let { children, data } = $props();

  onMount(() => themeService.initDisplay());
</script>

<TutorsShell showConnect={false} title={data.courseTitle ?? "Time"} titleHref={data.courseId ? `/${data.courseId}` : "/"}>
  {#snippet navigation()}<Navigation courseId={data.courseId ?? ""} />{/snippet}
  {@render children()}
</TutorsShell>
