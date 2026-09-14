<script lang="ts">
  import "../app.css";
  import StandaloneShell from "@tutors/ui-navigators/StandaloneShell.svelte";
  import type { Snippet } from "svelte";

  type Props = { children: Snippet };
  let { children }: Props = $props();
</script>

<StandaloneShell title="Tutors Live">
  {@render children()}
</StandaloneShell>
