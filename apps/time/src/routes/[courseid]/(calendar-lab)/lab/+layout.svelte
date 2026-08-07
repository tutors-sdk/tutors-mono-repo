<script lang="ts">
  let { children } = $props();
</script>

<div class="flex-1 min-h-0 flex flex-col h-full">
  {@render children()}
</div>
