<script lang="ts">
  import { bookmarkService, type CourseVisit, type HomeBookmarks } from "@tutors/connect";
  import { t } from "@tutors/i18n";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";

  const { bookmarks, courseVisits, onchange }: { bookmarks: HomeBookmarks; courseVisits: CourseVisit[]; onchange: (b: HomeBookmarks) => void } = $props();

  const courseTitle = (id: string) => courseVisits.find((cv) => cv.id === id)?.title ?? id;

  async function remove(courseId: string, loRoute: string) {
    if (await bookmarkService.toggle(courseId, loRoute)) onchange(bookmarkService.bookmarks);
  }
</script>

<!-- Rules 0150 to 0153: what the reader bookmarked, newest first, each a link back to the page. -->
<section class="bookmarks" aria-labelledby="bookmarks-title">
  <h2 id="bookmarks-title" class="ui-section-title mt-8 mb-4">{t("home.bookmarks")}</h2>
  {#if bookmarks === "unavailable"}
    <p class="ui-empty">{t("home.bookmarksUnavailable")}</p>
  {:else if bookmarks && bookmarks.length > 0}
    <ul class="ui-panel bookmark-list">
      {#each bookmarks as bookmark (bookmark.courseId + bookmark.loRoute)}
        <li>
          <a href={bookmark.loRoute}>
            <Icon type={bookmark.loType} height="20" />
            <span class="title">{bookmark.title}</span>
            <span class="course">{courseTitle(bookmark.courseId)}</span>
          </a>
          <button class="ui-button remove" aria-label={`${t("bookmarks.remove")}: ${bookmark.title}`} onclick={() => remove(bookmark.courseId, bookmark.loRoute)}>
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
  .bookmark-list { display: grid; gap: var(--space-1); padding: var(--space-2); }
  li { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
  /* Menu-style rows: 44px, 8px radius, selected grey on hover. */
  a { display: flex; flex: 1 1 auto; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); min-width: 0; min-height: 44px; padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); color: var(--ui-ink); }
  a:hover { background: var(--ui-selected); text-decoration: none; }
  .title { font-weight: var(--weight-medium); overflow-wrap: anywhere; }
  .course { font-size: var(--font-label); color: var(--ui-muted); overflow-wrap: anywhere; }
  .remove { flex: none; width: 44px; padding: 0; border-color: transparent; color: var(--ui-muted); }
</style>
