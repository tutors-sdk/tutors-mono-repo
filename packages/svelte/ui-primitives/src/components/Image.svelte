<script lang="ts">
  import Iconify from "@iconify/svelte";
  import Icon from "./Icon.svelte";
  import type { Lo } from "@tutors/tutors-model-lib";
  let { lo, miniImage = false }: { lo: Pick<Lo, "img" | "icon" | "title" | "type">; miniImage?: boolean } = $props();
  let failedSource = $state("");
</script>
<span class="lo-artwork" class:mini={miniImage}>
  {#if lo?.icon}
    <Iconify icon={lo.icon.type} color={lo.icon.color} width="100%" height="100%" aria-label={lo.title} />
  {:else if lo?.img && failedSource !== lo.img}
    <img src={lo.img} alt={lo.title} onerror={() => failedSource = lo.img ?? ""} />
  {:else}
    <Icon type={lo?.type ?? "course"} height={miniImage ? "40" : "64"} />
  {/if}
</span>
<style>
  .lo-artwork { display: inline-flex; align-items: center; justify-content: center; width: 80px; height: 80px; flex-shrink: 0; }
  .mini { width: 48px; height: 48px; }
  img { width: 100%; height: 100%; object-fit: contain; }
</style>
