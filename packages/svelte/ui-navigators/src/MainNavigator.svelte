<script lang="ts">
  import { AppBar } from "@skeletonlabs/skeleton-svelte";
  import CourseTitle from "@tutors/ui-navigators/titles/CourseTitle.svelte";
  import SearchButton from "@tutors/ui-navigators/buttons/SearchButton.svelte";
  import LayoutMenu from "@tutors/ui-navigators/LayoutMenu.svelte";
  import LlmsIndicator from "@tutors/ui-navigators/buttons/LlmsIndicator.svelte";
  import TutorsTimeIndicator from "@tutors/ui-navigators/buttons/TutorsTimeIndicator.svelte";
  import TocButton from "@tutors/ui-navigators/buttons/TocButton.svelte";
  import InfoButton from "@tutors/ui-navigators/buttons/InfoButton.svelte";
  import AnonProfile from "@tutors/ui-navigators/tutors-connect/AnonProfile.svelte";
  import ConnectedProfile from "@tutors/ui-navigators/tutors-connect/ConnectedProfile.svelte";
  import TutorsTitle from "@tutors/ui-navigators/titles/TutorsTitle.svelte";
  import CalendarButton from "@tutors/ui-navigators/buttons/CalendarButton.svelte";
  import CourseSentimentButton from "@tutors/ui-navigators/buttons/CourseSentimentButton.svelte";
  import EducatorButton from "@tutors/ui-navigators/buttons/EducatorButton.svelte";
  import { currentCourse, tutorsId, isEducator } from "@tutors/runes";
  import { t } from "@tutors/i18n";

  let { showConnect = true } = $props();
</script>

<nav aria-label={t("a11y.mainNavigation")}>
<AppBar>
  <AppBar.Toolbar class="grid-cols-[auto_1fr_auto]">
    <AppBar.Lead>
      {#if currentCourse?.value}
        <span class="hidden md:block">
          <InfoButton />
        </span>
      {:else}
        <span class="ml-12">
          <TutorsTitle title="Tutors Open Source Project" subtitle="Open Web Learning Components" />
        </span>
      {/if}
    </AppBar.Lead>

    <AppBar.Headline>
      {#if currentCourse?.value}
        <CourseTitle />
      {/if}
    </AppBar.Headline>

    <AppBar.Trail>
      {#if showConnect}
        <CalendarButton />
        {#if tutorsId.value?.login && tutorsId.value?.share === "true"}
          <div class="flex items-center">
            <CourseSentimentButton />
          </div>
        {/if}
      {/if}
      <div class="items-center md:flex">
        {#if showConnect}
          <div class="hidden md:flex">
            <LlmsIndicator />
          </div>
          <div class="hidden md:flex">
            <TutorsTimeIndicator />
          </div>
          <EducatorButton showPanel={isEducator.value} />
        {/if}
        <div class="flex items-center">
          {#if currentCourse?.value && !currentCourse?.value?.isPortfolio}
            <SearchButton />
          {/if}
        </div>
      </div>
      <div class="flex items-center">
        <LayoutMenu />
      </div>
      {#if showConnect}
        <span class="mx-2 h-10 w-[1px]" style="background-color: light-dark(rgb(156, 163, 175), rgb(229, 231, 235));"></span>
        {#if !currentCourse?.value?.isPrivate}
          <div class="relative">
            {#if !tutorsId.value?.login}
              <AnonProfile redirect="/{currentCourse?.value?.courseId}" />
            {:else}
              <ConnectedProfile />
            {/if}
          </div>
        {/if}
      {/if}
      <span class="hidden md:block">
        {#if currentCourse?.value && !currentCourse?.value?.isPortfolio}
          <TocButton />
        {/if}
      </span>
    </AppBar.Trail>
  </AppBar.Toolbar>
</AppBar>
</nav>
