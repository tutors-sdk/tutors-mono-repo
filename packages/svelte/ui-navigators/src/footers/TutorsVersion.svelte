<script lang="ts">
  import { t } from "@tutors/i18n";
  const version = APP_VERSION;
</script>

<a href="https://tutors.dev" target="_blank" rel="noopener noreferrer">
  <!-- data-tutors-build marks the one build-dependent string in the UI so release comparisons can mask it. -->
  <p class="footer-version" data-tutors-build="version">
    {t("footer.version")}{version}
  </p>
</a>
<style>
  .footer-version { font-size: var(--font-caption); color: var(--ui-muted); }
</style>
