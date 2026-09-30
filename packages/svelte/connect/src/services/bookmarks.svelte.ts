/**
 * @service Bookmarks
 * The signed-in reader's bookmarks, kept by the reader's server (Rules 0150 to 0153).
 * Nothing is asked for, and nothing can be bookmarked, when no one is signed in.
 */

import { dataApi, type Bookmark } from "@tutors/data-api";
import { rune, tutorsId } from "@tutors/runes";

// Initialize before a button's derived value reads it, so that value subscribes to later loads.
const list = rune<Bookmark[]>([]);

export const bookmarkService = {
  /** The bookmarks last loaded, newest first. */
  get bookmarks(): Bookmark[] {
    return list.value;
  },

  /** Loads the signed-in reader's bookmarks; null when the data API does not answer. */
  async load(): Promise<Bookmark[] | null> {
    if (!tutorsId.value?.login) {
      list.value = [];
      return [];
    }
    const answer = await dataApi.getBookmarks();
    if (!answer) return null;
    list.value = answer.bookmarks;
    return answer.bookmarks;
  },

  isBookmarked(courseId: string, loRoute: string): boolean {
    return list.value.some((b) => b.courseId === courseId && b.loRoute === loRoute);
  },

  /** Bookmarks or forgets the learning object. True when the server saved the change and the list refreshed. */
  async toggle(courseId: string, loRoute: string): Promise<boolean> {
    if (!tutorsId.value?.login) return false;
    const change = { courseId, loRoute };
    const response = this.isBookmarked(courseId, loRoute) ? await dataApi.removeBookmark(change) : await dataApi.addBookmark(change);
    if (!response?.ok) return false;
    return (await this.load()) !== null;
  }
};
