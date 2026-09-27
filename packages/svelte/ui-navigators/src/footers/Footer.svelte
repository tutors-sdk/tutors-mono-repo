<script lang="ts">
  import { currentCourse } from "@tutors/runes";
  import SetuIcon from "@tutors/ui-primitives/components/SetuIcon.svelte";
  import TutorsIcon from "@tutors/ui-primitives/components/TutorsIcon.svelte";
  import TutorsMessage from "./TutorsMessage.svelte";
  import TutorsVersion from "./TutorsVersion.svelte";
  import { t } from "@tutors/i18n";
</script>

{#if currentCourse?.value?.footer}
  <div class="w-full">
    <img src="https://{currentCourse?.value?.courseUrl}/{currentCourse?.value?.footer}" alt={t("footer.sponsorsAlt")} class="w-full" />
  </div>
{:else}
  <div class="footer-content">
    <TutorsIcon widthPlease="28px" />
    <TutorsVersion />
    <div class="footer-message"><TutorsMessage /></div>
    <SetuIcon />
  </div>
{/if}
<style>
  .footer-content { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); padding: var(--space-5) var(--space-6); color: var(--ui-muted); background: var(--ui-surface); }
  .footer-message { flex: 1; min-width: min(100%, 260px); }
</style>
