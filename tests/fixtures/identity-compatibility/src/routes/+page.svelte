<script lang="ts">
  import Page from "./[...path]/+page.svelte";
  const { data } = $props();
</script>

<Page {data} />
