<script lang="ts">
  import { page } from "$app/state";
  import { currentCourse, currentLo, isEducator, tutorsId } from "@tutors/runes";
  import { t } from "@tutors/i18n";
  import { analyticsEnabled } from "@tutors/connect";
  import LoContextTree from "@tutors/ui-primitives/components/LoContextTree.svelte";
  import type { LiveLab } from "@tutors/course/course";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import CalendarButton from "./buttons/CalendarButton.svelte";
  import InfoButton from "./buttons/InfoButton.svelte";
  import TocButton from "./buttons/TocButton.svelte";
  import WhiteboardButton from "./buttons/WhiteboardButton.svelte";
  import EditCoursButton from "./buttons/EditCoursButton.svelte";
  import CourseSentimentButton from "./buttons/CourseSentimentButton.svelte";
  let { showConnect = true, mobile = false } = $props();
  const course = $derived(currentCourse.value);
  const lab = $derived((page.data as { lab?: LiveLab }).lab);
  const parentTopic = $derived(lab?.lab.breadCrumbs?.findLast(lo => lo.type === "topic"));
  const companionLabels: Record<string, string> = { moodle: "Moodle", youtube: "YouTube", slack: "Slack", zoom: "Zoom", teams: "Teams", podcast: "Podcast" };
</script>
<nav class="course-navigation" aria-label={t("shell.navigation")}>
  <div class="navigation-scroll">
  {#if lab && !lab.lab.pdf}
    <a class="nav-row" href={parentTopic?.route ?? lab.lab.parentLo?.route ?? course?.route}>← {parentTopic?.title ?? lab.lab.parentLo?.title ?? course?.title}</a>
    <h2>{lab.lab.title}</h2>
    <p class="ui-muted text-sm">{t("shell.steps")} · {lab.index + 1} / {lab.steps.length}</p>
    <ol class="steps" aria-label={t("shell.steps")}>
      {#each lab.lab.los as step, i}
        <li><a class="nav-row" href={`${lab.url}/${encodeURI(step.shortTitle)}`} aria-current={lab.index === i ? "step" : undefined}><span class="step-number">{String(i + 1).padStart(2, "0")}</span>{lab.chaptersTitles.get(step.shortTitle) ?? step.title}</a></li>
      {/each}
    </ol>
    <hr />
  {/if}
  {#if course}
    <p class="nav-section">{t("shell.learn")}</p>
    <a class="nav-row" href={course.route} aria-current={page.url.pathname === course.route ? "page" : undefined}><Icon icon="lucide:book-open" height="20" />{t("shell.overview")}</a>
    {#if !course.isPortfolio}
      <a class="nav-row" href={`/search/${course.courseId}`} aria-current={page.url.pathname.includes("/search/") ? "page" : undefined}><Icon icon="lucide:search" height="20" />{t("shell.resources")}</a>
    {/if}
    {#if showConnect}<CalendarButton labelled />{/if}
    {#if course.companions?.show && course.companions.bar.length > 0}
      <p class="nav-section">{t("shell.links")}</p>
      {#each course.companions.bar as item}
        <a class="nav-row" href={item.link} target={item.target} rel={item.target === "_blank" ? "noopener noreferrer" : undefined}><Icon type={item.type} /><span>{companionLabels[item.type] ?? item.tip}</span><span class="external" aria-hidden="true">↗</span></a>
      {/each}
    {/if}
    <div class="tool-section">
    <p class="nav-section">{t("shell.tools")}</p>
    {#if mobile}<InfoButton showEducatorPanel={isEducator.value} labelled />{/if}
    {#if !mobile && !course.isPortfolio}<TocButton labelled />{/if}
    {#if course.properties.github}<EditCoursButton labelled />{/if}
    {#if showConnect}
      {#if course.llm === 2}<a class="nav-row" href={`/llm/${course.courseId}`}><Icon type="llm" />{t("nav.llms.tip")}</a>{/if}
      {#if analyticsEnabled && tutorsId.value?.share === "true"}
        <a class="nav-row" href={`/time/${course.courseId}`}><Icon type="tutorsTime" />{t("shell.myTime")}</a>
      {/if}
      {#if course.authLevel! > 0 && tutorsId.value?.share === "true"}
        <a class="nav-row" href={`https://time.tutors.dev/${course.courseId}`}><Icon type="tutorsTime" />Tutors Time ↗</a>
      {/if}
      {#if course.hasWhiteboard}<WhiteboardButton labelled />{/if}
      {#if tutorsId.value?.login && tutorsId.value.share === "true"}<div class="nav-row"><CourseSentimentButton /><span>{t("content.sentiment")}</span></div>{/if}
    {/if}
    </div>
    {#if currentLo.value?.parentTopic && !lab}
      <details><summary class="nav-row">{currentLo.value.parentTopic.title}<span class="nav-chevron"><Icon icon="lucide:chevron-down" height="20" /></span></summary><LoContextTree lo={currentLo.value.parentTopic} expandAll={false} /></details>
    {/if}
  {:else}
    <p class="nav-section">Tutors</p>
    <a class="nav-row" href={showConnect ? "/" : "https://tutors.dev/"} aria-current={showConnect && page.url.pathname === "/" ? "page" : undefined}><Icon type="course" />{t("shell.myCourses")}</a>
    <a class="nav-row" href="https://catalogue.tutors.dev" target="_blank" rel="noreferrer"><Icon type="topic" />{t("home.catalogue")} ↗</a>
    <a class="nav-row" href="https://live.tutors.dev" target="_blank" rel="noreferrer"><Icon type="live" />{t("home.live")} ↗</a>
    <a class="nav-row" href={showConnect ? "/create" : "https://tutors.dev/create"} aria-current={page.url.pathname === "/create" ? "page" : undefined}><Icon type="course" />{t("home.create")}</a>
    <a class="nav-row" href={showConnect ? "/course/tutors-reference-manual" : "https://tutors.dev/course/tutors-reference-manual"}><Icon type="note" />{t("home.docs")}</a>
  {/if}
  </div>
</nav>
<style>
  .course-navigation { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: var(--font-label); }
  .navigation-scroll { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: var(--space-1); overflow-y: auto; overscroll-behavior: contain; padding: var(--space-6) var(--space-4); }
  .nav-section { margin: var(--space-6) var(--space-3) var(--space-2); color: var(--ui-muted); text-transform: var(--ui-label-transform); letter-spacing: var(--ui-label-spacing); font-size: var(--font-small); font-weight: var(--weight-semibold); }
  .navigation-scroll > .nav-section:first-child { margin-top: 0; }
  .tool-section { display: contents; }
  .tool-section:not(:has(:global(.nav-row))) { display: none; }
  .course-navigation :global(.nav-row) { display: flex; align-items: center; gap: var(--space-3); min-height: 44px; padding: var(--space-3); border-radius: var(--radius-control); color: var(--ui-ink); text-decoration: none; overflow-wrap: anywhere; }
  .course-navigation :global(.nav-row:hover), .course-navigation :global(.nav-row[aria-current]) { background: var(--ui-selected); }
  .course-navigation :global(.nav-row[aria-current]) { box-shadow: inset 3px 0 var(--ui-brand); font-weight: var(--weight-semibold); }
  .nav-row > span:not(.external):not(.step-number) { min-width: 0; }
  .external { margin-left: auto; color: var(--ui-muted); }

  h2 { font-size: var(--font-section); font-weight: var(--weight-semibold); margin-block: var(--space-5) var(--space-2); overflow-wrap: anywhere; }
  .steps { display: grid; gap: var(--space-1); margin-block: var(--space-5); }
  .steps .nav-row { align-items: baseline; }
  .step-number { flex-shrink: 0; min-width: 2ch; font-variant-numeric: tabular-nums; color: var(--ui-muted); font-size: var(--font-caption); }
  hr { border-color: var(--ui-border); }
  .course-navigation :global([data-scope="dialog"][data-part="trigger"]) { width: 100%; text-align: left; border-radius: var(--radius-control); font-weight: var(--weight-regular); }
  .course-navigation :global([data-scope="dialog"][data-part="trigger"]:hover) { background: var(--ui-selected); }
  .nav-chevron { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; margin-left: auto; color: var(--ui-muted); }
  details[open] > summary .nav-chevron { transform: rotate(180deg); }
</style>
