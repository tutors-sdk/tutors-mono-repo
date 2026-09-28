<script lang="ts">
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";
  import { siteUrls } from "@tutors/ui-primitives/utils/site-urls";
</script>

<div class="ui-actions home-links mt-6">
  <a
    class="ui-button"
    href="/create"
    rel="noreferrer"
  >
    <Icon type="course" /> {t("home.create")}
  </a>
  <a
    class="ui-button"
    href="/course/tutors-reference-manual"
    rel="noreferrer"
  >
    <Icon type="note" /> {t("home.docs")}
  </a>
  <a
    class="ui-button"
    href="https://github.com/tutors-sdk/tutors-mono-repo"
    target="_blank"
    rel="noreferrer"
  >
    <Icon type="github" /> {t("home.source")}
  </a>
  <a
    class="ui-button"
    href={siteUrls.catalogue}
    target="_blank"
    rel="noreferrer"
  >
    <Icon type="topic" /> {t("home.catalogue")}
  </a>
  <a
    class="ui-button"
    href={siteUrls.live}
    target="_blank"
    rel="noreferrer"
  >
    <Icon type="live" /> {t("home.live")}
  </a>
  <a
    class="ui-button"
    href={siteUrls.time}
    target="_blank"
    rel="noreferrer"
  >
    <Icon type="tutorsTime" /> {t("classTime.app")}
  </a>
</div>
<style>
  /* Phones: an even two-column grid rather than rows of ragged widths. */
  @media (max-width: 639px) { .home-links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
