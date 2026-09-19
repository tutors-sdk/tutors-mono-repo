<script lang="ts">
  import { t } from "@tutors/i18n";
  const version = APP_VERSION;
</script>

<a href="https://tutors.dev" target="_blank" rel="noopener noreferrer">
  <!-- data-tutors-build marks the one build-dependent string in the UI so release comparisons can mask it. -->
  <p class="pl-4 text-xs" data-tutors-build="version">
    {t("footer.version")}{version}
  </p>
</a>
