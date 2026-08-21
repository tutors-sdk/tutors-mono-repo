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
  <div class="w-60 h-[23rem] w-[28rem] h-48 w-64 h-64"></div>
  <div class="w-36 h-[14rem] w-[20rem] h-32 w-48 h-48"></div>
  <!-- Card image height classes from cardStyles -->
  <div class="h-28 h-40 h-16 w-48 w-32 w-32 h-32 w-24 h-24"></div>
  <!-- Grid column classes for responsive layouts -->
  <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"></div>
  <!-- Classes used in ui-primitives (Sidebar, Icon/Tooltip) that need to be in the compiled CSS -->
  <div class="bg-surface-100-900 btn-icon preset-tonal card z-9999 z-999 z-50"></div>
  <!-- Sidebar transition classes (dynamically constructed from position prop) -->
  <div class="justify-start justify-end translate-x-full -translate-x-full data-[state=open]:translate-x-0 starting:data-[state=open]:translate-x-full starting:data-[state=open]:-translate-x-full data-[state=open]:opacity-100 starting:data-[state=open]:opacity-0 opacity-0 transition transition-discrete overflow-y-scroll w-sm w-2xl shadow-xl"></div>
  <!-- Skeleton table utility classes -->
  <table class="table table-zebra table-wrap"></table>
</div>
