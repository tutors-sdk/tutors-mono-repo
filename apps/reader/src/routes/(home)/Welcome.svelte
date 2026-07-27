<script lang="ts">
  import { tutorsId } from "@tutors/runes";
  import { t } from "@tutors/i18n";
</script>

{#if tutorsId.value?.name}
  <span class="text-base">{t("home.connectedAs")}</span>
  <p class="text-2xl">
    {tutorsId.value?.name}
    ({tutorsId.value?.login})
  </p>
{/if}
