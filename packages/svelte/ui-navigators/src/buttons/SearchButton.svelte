<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { currentCourse } from "@tutors/runes";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";

  let previousPage = "";
  const isSearching = $derived(page.url.pathname.startsWith("/search/"));
  function toggleSearch() {
    if (isSearching) {
      void goto(previousPage || `/course/${currentCourse.value?.courseId}`);
    } else {
      previousPage = page.url.pathname + page.url.search;
      void goto(`/search/${currentCourse.value?.courseId}`);
    }
  }
</script>

<button class="header-action" data-tour="search" onclick={toggleSearch} aria-label={t("nav.search.tip")} aria-pressed={isSearching}>
  <Icon icon="lucide:search" height="20" />
  <span class="hidden md:block">{isSearching ? t("nav.search.exit") : t("nav.search")}</span>
</button>
