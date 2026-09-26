<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import Image from "@tutors/ui-primitives/components/Image.svelte";
  import { currentCourse, isEducator, tutorsId } from "@tutors/runes";
  import { t } from "@tutors/i18n";
  import TutorsIcon from "@tutors/ui-primitives/components/TutorsIcon.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import CourseNavigation from "./CourseNavigation.svelte";
  import LayoutMenu from "./LayoutMenu.svelte";
  import InfoButton from "./buttons/InfoButton.svelte";
  import TocButton from "./buttons/TocButton.svelte";
  import SearchButton from "./buttons/SearchButton.svelte";
  import ConnectedProfile from "./tutors-connect/ConnectedProfile.svelte";
  import AnonProfile from "./tutors-connect/AnonProfile.svelte";

  let { showConnect = true, title, titleHref, navigation, current = "" }: { showConnect?: boolean; title?: string; titleHref?: string; navigation?: Snippet; current?: string } = $props();
  const isCourseHome = $derived(!!currentCourse.value && page.url.pathname.replace(/\/$/, "") === currentCourse.value.route);
  // Cmd/Ctrl+K and "/" open the search dialog (SearchButton).
</script>
{#snippet menuSelector()}<span class="menu-toggle"><Icon icon="lucide:menu" height="22" /></span>{/snippet}
{#snippet sidebarContent()}<div class="mobile-course-navigation">{#if navigation}{@render navigation()}{:else}<CourseNavigation {showConnect} {current} mobile />{/if}</div>{/snippet}
<nav class="main-navigation" aria-label={t("a11y.mainNavigation")}>
  <div class="mobile-menu"><Sidebar position="left" {menuSelector} {sidebarContent} ariaLabel={t("shell.navigation")} /></div>
  {#if !currentCourse.value}
    <a class="brand" href={showConnect ? "/" : "https://tutors.dev/"} aria-label="Tutors"><TutorsIcon widthPlease="38px" /><span>tutors</span></a>
  {/if}
  <div class="course-heading" class:without-course={!currentCourse.value && !title}>
    {#if currentCourse.value}<span class="course-artwork"><Image lo={currentCourse.value} miniImage /></span>{/if}
    <div class="course-title-row">
      <svelte:element this={isCourseHome ? "h1" : "div"} class="course-title">
        <a data-tour="course-title" title={currentCourse.value?.title} href={currentCourse.value?.route ?? titleHref ?? "/"}>{currentCourse.value?.title ?? title ?? (showConnect ? t("shell.myCourses") : "Tutors")}</a>
      </svelte:element>
      {#if currentCourse.value}<div class="course-info"><InfoButton showEducatorPanel={isEducator.value} /></div>{/if}
    </div>
    {#if currentCourse.value}
      {#if !currentCourse.value.isPortfolio}<div class="mobile-tree"><TocButton /></div>{/if}
    {/if}
  </div>
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
  .course-heading { display: flex; align-items: center; gap: var(--space-2); flex: 1; min-width: 0; }
  .course-title-row { display: flex; flex: 1; min-width: 0; align-items: center; gap: var(--space-2); }
  .course-artwork { display: flex; }
  .course-title { min-width: 0; font-size: var(--font-heading); font-weight: var(--weight-semibold); line-height: var(--leading-heading); color: var(--ui-ink); overflow-wrap: anywhere; }
  .course-info :global(svg) { width: 24px; height: 24px; }
  .course-info { flex-shrink: 0; }
  .course-info :global(button) { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: var(--radius-control); }
  .course-info :global(button:hover) { background: var(--ui-selected); }
  .course-info :global(.nav-row) { display: flex; }
  .mobile-tree { display: none; }
  .header-actions { display: flex; align-self: stretch; align-items: center; gap: var(--space-2); margin-left: auto; }
  .header-actions :global([data-tour="profile"]) { display: flex; align-self: stretch; }
  .mobile-menu { display: none; }
  .menu-toggle { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; }
  @media (max-width: 1023px) {
    .mobile-menu { display: block; flex-shrink: 0; }
    .brand { width: auto; }
    .main-navigation { min-height: 64px; gap: var(--space-2); padding-inline: var(--space-4); }
    .course-heading { gap: var(--space-1); }
    .course-title { flex: 1; font-size: var(--font-section); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: normal; }
    .course-artwork, .course-info, .without-course { display: none; }
    .brand + .course-heading { margin-left: var(--space-2); padding-left: var(--space-3); border-left: 1px solid var(--ui-border); }
    .mobile-tree { display: block; flex-shrink: 0; }
    .mobile-tree :global(button) { width: 44px; height: 44px; border-radius: var(--radius-control); color: var(--ui-ink); }
    .mobile-tree :global(button:hover) { background: var(--ui-selected); }
    .mobile-tree :global(.nav-row) { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; }
    .mobile-tree :global(svg) { width: 24px; height: 24px; }
    .header-actions { min-height: 64px; flex-shrink: 0; gap: 0; }
    .header-actions :global(.header-action) { width: 44px; padding: var(--space-2); }
    .header-actions :global(.header-action > span) { display: none; }
  }
  /* A single mobile toolbar; long titles keep their full accessible name and wrap to at most two lines. */
  @media (max-width: 767px) {
    .brand { font-size: var(--font-section); gap: var(--space-2); }
    .main-navigation { min-height: 56px; padding-inline: var(--space-2); gap: var(--space-1); }
    .header-actions { min-height: 56px; }
    .course-title { font-size: var(--font-body); }
  }
  @media (max-width: 400px) {
    .course-title { font-size: var(--font-label); }
  }
  .mobile-course-navigation { height: 100%; }
</style>
