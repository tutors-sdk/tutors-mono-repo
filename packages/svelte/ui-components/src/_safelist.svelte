<script lang="ts">
  // This component is never rendered - it exists only to force Tailwind
  // to generate classes that are constructed dynamically in Card.svelte
</script>

<!-- These classes will never be seen, but Tailwind will detect them and generate the CSS -->
<div class="hidden">
  <div class="border-primary-500 border-secondary-500 border-tertiary-500"></div>
  <div class="border-success-500 border-warning-500 border-error-500 border-surface-500"></div>
  <div class="preset-filled-primary-100-900 preset-filled-secondary-100-900 preset-filled-tertiary-100-900"></div>
  <div class="preset-filled-success-100-900 preset-filled-warning-100-900 preset-filled-error-100-900 preset-filled-surface-100-900"></div>
  <div class="border-[1px] border-y-8"></div>
  <!-- Card dimension classes from cardStyles -->
  <div class="w-[216px] h-[20.7rem] w-[25.2rem] h-[172px] w-[230px] h-[230px]"></div>
  <div class="w-[130px] h-[12.6rem] w-[18rem] h-[115px] w-[173px] h-[173px]"></div>
  <!-- Grid column classes for responsive layouts -->
  <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"></div>
</div>
