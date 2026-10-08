<script lang="ts">
  import { page } from "$app/state";
  import { currentCourse, currentLo, currentLabStepIndex, currentNotebookCellIndex, isEducator, tutorsId } from "@tutors/runes";
  import { t } from "@tutors/i18n";
  import { analyticsEnabled } from "@tutors/connect";
  import LoContextTree from "@tutors/ui-primitives/components/LoContextTree.svelte";
  import type { LiveLab, NotebookService } from "@tutors/course/course";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import Image from "@tutors/ui-primitives/components/Image.svelte";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  import { loTypeColour, themeService } from "@tutors/themes";
  import { siteUrls } from "@tutors/ui-primitives/utils/site-urls";
  import CalendarButton from "./buttons/CalendarButton.svelte";
  import InfoButton from "./buttons/InfoButton.svelte";
  import EducatorControlButton from "./buttons/EducatorControlButton.svelte";
  import TocButton from "./buttons/TocButton.svelte";
  import WhiteboardButton from "./buttons/WhiteboardButton.svelte";
  import EditCoursButton from "./buttons/EditCoursButton.svelte";
  import OnlineButton from "./buttons/OnlineButton.svelte";
  let { showConnect = true, mobile = false, current = "" } = $props();
  const course = $derived(currentCourse.value);
  const lab = $derived((page.data as { lab?: LiveLab }).lab);
  const notebook = $derived((page.data as { notebook?: NotebookService }).notebook);
  // Whatever the reader has open. A lab and a notebook carry a service around their Lo, so those come
  // from page.data; everything else is just the Lo the route resolved to.
  const openLo = $derived(lab?.lab ?? notebook?.notebook ?? currentLo.value);
  /**
   * Where "back" goes from whatever is open. The topic it belongs to is the useful destination - a lab,
   * a note and a notebook all came from one - falling back to its immediate parent and then to the
   * course. A topic's own breadcrumbs end in itself, so a self-reference is stepped over.
   */
  const backTo = $derived.by(() => {
    if (!course || !openLo || openLo.route === course.route) return undefined;
    const topic = openLo.breadCrumbs?.findLast(crumb => crumb.type === "topic" && crumb.route !== openLo.route);
    const parent = openLo.parentLo?.route === openLo.route ? undefined : openLo.parentLo;
    const target = topic ?? parent ?? course;
    // A top-level unit is drawn on the course's own front page, so a link to it is a link to the
    // course: name it after the course rather than after the unit the reader never saw a page for.
    return target.route === course.route ? course : target;
  });
  const companionLabels: Record<string, string> = { moodle: "Moodle", youtube: "YouTube", slack: "Slack", zoom: "Zoom", teams: "Teams", podcast: "Podcast" };
</script>
<!-- Unnamed: the complementary landmark around it (or the dialog on phones) already carries "Course navigation". Rule 0170. -->
<nav class="course-navigation">
  <div class="navigation-scroll">
  <!-- Labs and notebooks lead with compact context so their steps and outline have room. Other
       resources show the full card. The course header already covers the course's own front page. -->
  {#if course && openLo && openLo.route !== course.route}
    {@const colour = loTypeColour(openLo.type)}
    {#snippet resourceCard()}
    <article class="lo-card" data-lo-card={openLo.type} style:--resource-accent={colour.border} style:--resource-background={colour.background}>
      <div class="lo-card-heading">
        <h2>{openLo.title}</h2>
        <span class="lo-card-type" title={openLo.type}><Icon icon={themeService.getIcon(openLo.type).type} color="var(--resource-accent)" height="26" /></span>
      </div>
      <!-- Image falls back to the type icon where the author set no artwork. -->
      <Image lo={openLo} />
      {#if openLo.summary}<div class="lo-card-summary">{@html sanitizeHtml(openLo.summary)}</div>{/if}
    </article>
    {/snippet}
    {#if openLo.type === "lab" || openLo.type === "notebook"}
      {#key openLo.route}
      <details class="lo-context" style:--resource-accent={colour.border}>
        <summary class="lo-context-heading">
          <span aria-hidden="true"><Image lo={openLo} miniImage /></span>
          <span class="lo-context-copy">
            <strong>{openLo.title}</strong>
            <span class="lo-context-type"><Icon icon={themeService.getIcon(openLo.type).type} color="var(--resource-accent)" height="14" />{openLo.type}</span>
          </span>
          <span class="nav-chevron"><Icon icon="lucide:chevron-down" height="20" /></span>
        </summary>
        <div class="lo-context-card">{@render resourceCard()}</div>
      </details>
      {/key}
    {:else}
      {@render resourceCard()}
    {/if}
    <!-- The way out, under the card that says where you are. Labs and notebooks have always had one;
         every other resource is just as deep in the course and now gets the same link. -->
    {#if backTo}<a class="nav-row back-link" href={backTo.route}>← {backTo.title}</a>{/if}
  {/if}
  {#if lab && !lab.lab.pdf}
    <p class="ui-muted text-sm list-count">{t("shell.steps")} · {currentLabStepIndex.value + 1} / {lab.steps.length}</p>
    <ol class="steps" aria-label={t("shell.steps")}>
      {#each lab.lab.los as step, i}
        <li><a class="nav-row" href={`${lab.url}/${encodeURI(step.shortTitle)}`} aria-current={currentLabStepIndex.value === i ? "step" : undefined}><span class="step-number">{String(i + 1).padStart(2, "0")}</span>{lab.chaptersTitles.get(step.shortTitle) ?? step.title}</a></li>
      {/each}
    </ol>
    <hr />
  {/if}
  <!-- A notebook's outline is derived structure, like a lab's steps, so it belongs to the shell. A note's
       table of contents is the author's own ([[toc]]) and part of the prose, so it stays in the prose. -->
  {#if notebook}
    <p class="ui-muted text-sm list-count">{t("shell.outline")} · {notebook.outline.length}</p>
    <ol class="steps" aria-label={t("shell.outline")}>
      {#each notebook.outline as entry, i}
        <li><a class="nav-row" href={`#notebook-cell-${entry.index}`} onclick={() => notebook.setActiveCell(entry.index)} aria-current={currentNotebookCellIndex.value === entry.index ? "step" : undefined}><span class="step-number">{String(i + 1).padStart(2, "0")}</span>{entry.title}</a></li>
      {/each}
    </ol>
    <hr />
  {/if}
  {#if course}
    <!-- Learn holds every way into the course's own content: its front page, its summary, its tree, its
         search, its calendar, its machine-readable copy, its source, and - for an educator - the controls
         that administer it. They are ways of reading or running one course, so they read as one list
         rather than as content in Learn and its index under Tools. -->
    <p class="nav-section">{t("shell.learn")}</p>
    <a data-tour="overview" class="nav-row" href={course.route} aria-current={page.url.pathname === course.route ? "page" : undefined}><Icon icon="lucide:book-open" height="20" />{t("shell.overview")}</a>
    <!-- The same summary for everyone. It used to sit in the header, where an educator never saw it:
         the header handed them Educator Control instead, with the summary buried in a tab of it. -->
    <InfoButton labelled />
    {#if !mobile && !course.isPortfolio}<TocButton labelled />{/if}
    {#if !course.isPortfolio}
      <a data-tour="resources" class="nav-row" href={`/search/${course.courseId}`} aria-current={page.url.pathname.includes("/search/") ? "page" : undefined}><Icon icon="lucide:search" height="20" />{t("shell.resources")}</a>
    {/if}
    {#if showConnect}<CalendarButton labelled />{/if}
    {#if showConnect && course.llm === 2}<a data-tour="llm" class="nav-row" href={`/llm/${course.courseId}`}><Icon type="llm" />{t("nav.llms.tip")}</a>{/if}
    {#if course.properties.github}<EditCoursButton labelled />{/if}
    <!-- An educator's administration of the course they are reading, so it closes the Learn list rather
         than opening a group of its own. Gated here, not inside: it reads the course's locks. -->
    {#if isEducator.value}<EducatorControlButton labelled />{/if}
    <div class="tool-section">
    <p class="nav-section">{t("shell.tools")}</p>
    {#if showConnect && course.hasWhiteboard}<WhiteboardButton labelled />{/if}
    </div>
    <!-- Tutors Time is one product with several views, so its links are one group rather than rows
         scattered between here and the account menu. Sharing presence gates the group: every view
         reads the activity that sharing produces. -->
    {#if showConnect && tutorsId.value?.login && tutorsId.value.share === "true"}
      <div class="tool-section">
      <p class="nav-section">{t("shell.activity")}</p>
      {#if analyticsEnabled}<a data-tour="my-time" class="nav-row" href={`/time/${course.courseId}`}><Icon type="tutorsTime" />{t("shell.myTime")}</a>{/if}
      <!-- The class's activity is an educator's view of everyone, so an educator is exactly who sees it.
           It replaces a gate on the course's authLevel, which let a link to a dashboard a student cannot
           read appear for the whole class. -->
      {#if isEducator.value}
        <a data-tour="class-activity" class="nav-row" href={`${siteUrls.time}/${course.courseId}`} target="_blank" rel="noopener noreferrer"><Icon type="tutorsTime" />{t("shell.classActivity")}<span class="external" aria-hidden="true">↗</span></a>
      {/if}
      <a data-tour="live-now" class="nav-row" href={`${siteUrls.live}/${course.courseId}`} target="_blank" rel="noopener noreferrer"><Icon type="live" />{t("shell.liveNow")}<span class="external" aria-hidden="true">↗</span></a>
      <OnlineButton />
      </div>
    {/if}
    <!-- Companions lead out of the course, to Moodle, a playlist, a chat. Everything above leads further
         into it, so they close the list rather than splitting Learn from Activity (#372). -->
    {#if course.companions?.show && course.companions.bar.length > 0}
      <!-- A real box, not the tool-section's `display: contents`: which companions a course offers is the
           author's choice, so the tour speaks about the group and needs something to point at. -->
      <div class="nav-group" data-tour="companions">
        <p class="nav-section">{t("shell.links")}</p>
        {#each course.companions.bar as item}
          <a class="nav-row" href={item.link} target={item.target} rel={item.target === "_blank" ? "noopener noreferrer" : undefined}><Icon type={item.type} /><span>{companionLabels[item.type] ?? item.tip}</span><span class="external" aria-hidden="true">↗</span></a>
        {/each}
      </div>
    {/if}
    {#if currentLo.value?.parentTopic && !lab}
      <details><summary class="nav-row">{currentLo.value.parentTopic.title}<span class="nav-chevron"><Icon icon="lucide:chevron-down" height="20" /></span></summary><LoContextTree lo={currentLo.value.parentTopic} expandAll={false} /></details>
    {/if}
  {:else}
    <p class="nav-section">Tutors</p>
    <a data-tour="my-courses" class="nav-row" href={showConnect ? "/" : `${siteUrls.reader}/`} aria-current={showConnect && page.url.pathname === "/" ? "page" : undefined}><Icon type="course" />{t("shell.myCourses")}</a>
    {#if current === "catalogue"}<a data-tour="catalogue" class="nav-row" href="/" aria-current="page"><Icon type="topic" />{t("home.catalogue")}</a>
    {:else}<a data-tour="catalogue" class="nav-row" href={siteUrls.catalogue} target="_blank" rel="noreferrer"><Icon type="topic" />{t("home.catalogue")} ↗</a>{/if}
    {#if current === "live"}<a data-tour="live" class="nav-row" href="/" aria-current={page.url.pathname === "/" ? "page" : "location"}><Icon type="live" />{t("home.live")}</a>
    {:else}<a data-tour="live" class="nav-row" href={siteUrls.live} target="_blank" rel="noreferrer"><Icon type="live" />{t("home.live")} ↗</a>{/if}
    {#if current === "time"}<a data-tour="time" class="nav-row" href="/" aria-current="page"><Icon type="tutorsTime" />{t("classTime.app")}</a>
    {:else}<a data-tour="time" class="nav-row" href={siteUrls.time} target="_blank" rel="noreferrer"><Icon type="tutorsTime" />{t("classTime.app")} ↗</a>{/if}
    <a data-tour="create" class="nav-row" href={showConnect ? "/create" : `${siteUrls.reader}/create`} aria-current={page.url.pathname === "/create" ? "page" : undefined}><Icon type="course" />{t("home.create")}</a>
    <a data-tour="docs" class="nav-row" href={showConnect ? "/course/tutors-reference-manual" : `${siteUrls.reader}/course/tutors-reference-manual`}><Icon type="note" />{t("home.docs")}</a>
  {/if}
  </div>
</nav>
<style>
  .course-navigation { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: var(--font-label); line-height: var(--leading-ui); }
  .navigation-scroll { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: var(--space-1); overflow-y: auto; overscroll-behavior: contain; padding: var(--space-6) var(--space-4); }
  /* Keep each row at its content height; short sidebars scroll instead of compressing buttons. */
  .navigation-scroll > :global(*), .tool-section > :global(*), .nav-group > :global(*) { flex-shrink: 0; }
  .nav-section { margin: var(--space-6) var(--space-3) var(--space-2); color: var(--ui-muted); text-transform: var(--ui-label-transform); letter-spacing: var(--ui-label-spacing); font-size: var(--font-small); font-weight: var(--weight-semibold); }
  .navigation-scroll > .nav-section:first-child { margin-top: 0; }
  .lo-context { border: 1px solid var(--ui-border); border-radius: var(--radius-control); background: var(--ui-surface); }
  .lo-context-heading { display: flex; align-items: center; gap: var(--space-3); min-height: 44px; padding: var(--space-3); list-style: none; border-radius: var(--radius-control); }
  .lo-context-heading::-webkit-details-marker { display: none; }
  .lo-context-heading:hover { background: var(--ui-selected); }
  .lo-context-copy { flex: 1; min-width: 0; }
  .lo-context-copy strong { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-size: var(--font-label); font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
  .lo-context-type { display: flex; align-items: center; gap: var(--space-1); margin-top: var(--space-1); font-size: var(--font-caption); color: var(--ui-muted); text-transform: capitalize; }
  .lo-context-card { padding: 0 var(--space-3) var(--space-3); }
  /* Drawn like a canvas card so a reader recognises it, but sized to the column rather than to
     --card-width: it takes the menu's full width and only as much height as its three parts need, so a
     narrow menu gets a smaller card instead of a stretched one and the Learn list stays above the fold.
     Padding and the colour bands come down a step from the canvas card's to match. */
  .lo-card { display: flex; flex-direction: column; width: 100%; overflow: hidden; padding: var(--space-4); background: color-mix(in srgb, var(--resource-background) 72%, var(--ui-surface)); border: 1px solid var(--resource-accent); border-block-width: 6px; border-radius: var(--radius-panel); }
  .lo-card-heading { display: flex; flex: none; min-width: 0; align-items: flex-start; justify-content: space-between; gap: var(--space-2); }
  /* Clamped like the canvas card's, so a long title or summary cannot grow the card past its box. */
  .lo-card h2 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin-block: 0; font-size: var(--font-body); line-height: var(--leading-ui); font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
  .lo-card-type { display: inline-flex; flex-shrink: 0; align-items: center; color: var(--resource-accent); }
  .lo-card-summary { flex: none; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; text-align: center; font-size: var(--font-label); line-height: var(--ui-summary-leading); color: var(--ui-muted); overflow-wrap: anywhere; }
  /* Square, and as wide as the canvas card's artwork unless the menu is narrower than that, in which
     case it shrinks with the column rather than letterboxing inside a fixed box. */
  .lo-card :global(.lo-artwork) { flex: none; align-self: center; width: min(var(--card-artwork), 100%); height: auto; aspect-ratio: 1; margin-block: var(--space-3); }
  .lo-card :global(.lo-artwork svg) { width: 100%; height: 100%; }
  /* Lays its rows out exactly as the scroll does, so wrapping them changes nothing a reader sees. */
  .nav-group { display: flex; flex-direction: column; gap: var(--space-1); }
  .tool-section { display: contents; }
  .tool-section:not(:has(:global(.nav-row))) { display: none; }
  .course-navigation :global(.nav-row) { display: flex; align-items: center; gap: var(--space-3); min-height: 44px; padding: var(--space-3); border-radius: var(--radius-control); color: var(--ui-ink); text-decoration: none; overflow-wrap: anywhere; }
  .course-navigation :global(.nav-row:hover), .course-navigation :global(.nav-row[aria-current]) { background: var(--ui-selected); }
  .course-navigation :global(.nav-row[aria-current]) { box-shadow: inset 3px 0 var(--ui-brand); font-weight: var(--weight-semibold); }
  .nav-row > span:not(.external):not(.step-number) { min-width: 0; }
  .course-navigation :global(.nav-row svg) { width: 24px; height: 24px; flex-shrink: 0; }
  .external { margin-left: auto; color: var(--ui-muted); }

  /* The step and outline counts used to sit under a heading that repeated the lab's title; the card
     above says it now, so the count carries that heading's spacing instead. */
  .list-count { margin-top: var(--space-5); }
  .steps { display: grid; gap: var(--space-1); margin-block: var(--space-2) var(--space-5); }
  .steps .nav-row { align-items: baseline; }
  .step-number { flex-shrink: 0; min-width: 2ch; font-variant-numeric: tabular-nums; color: var(--ui-muted); font-size: var(--font-caption); }
  hr { border-color: var(--ui-border); }
  .course-navigation :global([data-scope="dialog"][data-part="trigger"]) { width: 100%; text-align: left; border-radius: var(--radius-control); font-weight: var(--weight-regular); }
  .course-navigation :global([data-scope="dialog"][data-part="trigger"]:hover) { background: var(--ui-selected); }
  .nav-chevron { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; margin-left: auto; color: var(--ui-muted); }
  details[open] > summary .nav-chevron { transform: rotate(180deg); }
</style>
