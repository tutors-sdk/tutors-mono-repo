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
  <div class="bg-surface-100-800-token border-surface-200-700-token flex h-8 w-full items-center overflow-hidden border-t-[1px]">
    <div class="mx-auto flex w-full items-center">
          <div class="ml-4">
            <TutorsIcon widthPlease="28px" />
          </div>
          <div class="w-48">
            <TutorsVersion />
          </div>
          <div class="w-full">
            <TutorsMessage />
          </div>
      <SetuIcon />
    </div>
  </div>
{/if}
