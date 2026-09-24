<script lang="ts">
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";
</script>

<div class="ui-actions mt-6">
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
    href="https://catalogue.tutors.dev"
    target="_blank"
    rel="noreferrer"
  >
    <Icon type="live" /> {t("home.catalogue")}
  </a>
  <a
    class="ui-button"
    href="https://live.tutors.dev"
    target="_blank"
    rel="noreferrer"
  >
    <Icon type="tutorsTime" /> {t("home.live")}
  </a>
</div>
