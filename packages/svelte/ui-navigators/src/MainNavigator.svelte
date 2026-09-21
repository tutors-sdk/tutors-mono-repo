<script lang="ts">
  import { goto } from "$app/navigation";
  import { currentCourse, tutorsId } from "@tutors/runes";
  import { t } from "@tutors/i18n";
  import TutorsIcon from "@tutors/ui-primitives/components/TutorsIcon.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import CourseNavigation from "./CourseNavigation.svelte";
  import LayoutMenu from "./LayoutMenu.svelte";
  import SearchButton from "./buttons/SearchButton.svelte";
  import ConnectedProfile from "./tutors-connect/ConnectedProfile.svelte";
  import AnonProfile from "./tutors-connect/AnonProfile.svelte";

  let { showConnect = true } = $props();
  function searchShortcut(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && currentCourse.value && !currentCourse.value.isPortfolio) {
      event.preventDefault();
      void goto(`/search/${currentCourse.value.courseId}`);
    }
  }
</script>
<svelte:window onkeydown={searchShortcut} />
{#snippet menuSelector()}<span class="menu-toggle"><Icon icon="lucide:menu" height="22" /></span>{/snippet}
{#snippet sidebarContent()}<div class="mobile-course-navigation"><CourseNavigation {showConnect} /></div>{/snippet}
<nav class="main-navigation" aria-label={t("a11y.mainNavigation")}>
  <div class="mobile-menu"><Sidebar position="left" {menuSelector} {sidebarContent} ariaLabel={t("shell.navigation")} /></div>
  <a class="brand" href={showConnect ? "/" : "https://tutors.dev/"} aria-label="Tutors"><TutorsIcon widthPlease="38px" /><span>tutors</span></a>
  <a data-tour="course-title" class="course-title" href={currentCourse.value?.route ?? "/"}>{currentCourse.value?.title ?? (showConnect ? t("shell.myCourses") : "Tutors")}</a>
  <div class="header-actions">
    {#if currentCourse.value && !currentCourse.value.isPortfolio}<SearchButton />{/if}
    <LayoutMenu />
    {#if showConnect && !currentCourse.value?.isPrivate}
      {#if tutorsId.value?.login}<ConnectedProfile />{:else}<AnonProfile redirect={currentCourse.value ? `/${currentCourse.value.courseId}` : ""} />{/if}
    {/if}
  </div>
</nav>
<style>
  .main-navigation { min-height: 76px; display: flex; align-items: center; gap: var(--space-6); padding: 0 var(--space-6); }
  .brand { display: flex; align-items: center; gap: var(--space-3); width: 200px; flex-shrink: 0; color: var(--ui-ink); font-size: var(--font-brand); font-weight: var(--weight-semibold); text-decoration: none; }
  .course-title { min-width: 0; flex: 1; font-size: var(--font-label); color: var(--ui-muted); overflow-wrap: anywhere; }
  .header-actions { display: flex; align-self: stretch; align-items: center; gap: var(--space-2); margin-left: auto; }
  .header-actions :global([data-tour="profile"]) { display: flex; align-self: stretch; }
  .mobile-menu { display: none; }
  .menu-toggle { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; }
  @media (max-width: 1023px) { .mobile-menu { display: block; } .brand { width: auto; } .main-navigation { gap: var(--space-3); padding: 0 var(--space-4); } }
  @media (max-width: 767px) { .course-title { display: none; } .brand { font-size: var(--font-section); gap: var(--space-2); } .header-actions { gap: 0; } .main-navigation { gap: var(--space-1); padding-inline: var(--space-2); } }
  .mobile-course-navigation { height: 100%; }
</style>
