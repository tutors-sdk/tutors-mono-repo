<script lang="ts">
  import { bookmarkService, type CourseVisit, type HomeBookmarks } from "@tutors/connect";
  import { t } from "@tutors/i18n";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";

  const { bookmarks, courseVisits, onchange }: { bookmarks: HomeBookmarks; courseVisits: CourseVisit[]; onchange: (b: HomeBookmarks) => void } = $props();

  const courseTitle = (id: string) => courseVisits.find((cv) => cv.id === id)?.title ?? id;
  let busy = $state(false);
  let failed = $state(false);

  async function remove(courseId: string, loRoute: string) {
    if (busy) return;
    busy = true;
    failed = false;
    try {
      if (await bookmarkService.toggle(courseId, loRoute)) onchange(bookmarkService.bookmarks);
      else failed = true;
    } catch { failed = true; }
    finally { busy = false; }
  }
</script>

<!-- Rules 0150 to 0153: what the reader bookmarked, newest first, each a link back to the page. -->
<section class="bookmarks" aria-labelledby="bookmarks-title">
  <h2 id="bookmarks-title" class="ui-section-title mt-8 mb-4">{t("home.bookmarks")}</h2>
  {#if failed}<p role="alert">{t("bookmarks.failed")}</p>{/if}
  {#if bookmarks === "unavailable"}
    <p class="ui-empty">{t("home.bookmarksUnavailable")}</p>
  {:else if bookmarks && bookmarks.length > 0}
    <ul class="ui-grid bookmark-list">
      {#each bookmarks as bookmark (bookmark.courseId + bookmark.loRoute)}
        <li class="ui-panel">
          <a href={bookmark.loRoute}>
            <span class="artwork" aria-hidden="true"><Icon type={bookmark.loType} height="24" /></span>
            <span class="title">{bookmark.title}</span>
            <span class="course">{courseTitle(bookmark.courseId)}</span>
          </a>
          <button class="ui-button remove" disabled={busy} aria-label={`${t("bookmarks.remove")}: ${bookmark.title}`} onclick={() => remove(bookmark.courseId, bookmark.loRoute)}>
            <Icon icon="lucide:x" height="18" />
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="ui-empty">{t("home.bookmarksEmpty")}</p>
  {/if}
</section>

<style>
  .bookmark-list { grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); }
  li { display: flex; align-items: start; gap: var(--space-2); min-width: 0; padding: var(--space-4); }
  a { display: grid; grid-template-columns: 24px minmax(0, 1fr); flex: 1; align-items: start; gap: var(--space-1) var(--space-3); min-width: 0; min-height: 44px; padding-block: var(--space-2); border-radius: var(--radius-control); color: var(--ui-ink); }
  a:hover { background: var(--ui-selected); text-decoration: none; }
  .artwork { grid-row: 1 / 3; }
  .title { font-weight: var(--weight-medium); overflow-wrap: anywhere; }
  .course { grid-column: 2; font-size: var(--font-label); color: var(--ui-muted); overflow-wrap: anywhere; }
  .remove { flex: none; width: 44px; padding: 0; border-color: transparent; color: var(--ui-muted); }
</style>
