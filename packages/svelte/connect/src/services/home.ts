/**
 * @service Home
 * What the reader's home page shows: the courses in the profile and, for someone signed in,
 * how far they have got in each, the courses they teach and their bookmarks (Rules 0076 to 0079, 0150 to 0154).
 */

import { dataApi, type Bookmark, type CourseProgress } from "@tutors/data-api";
import { tutorsId } from "@tutors/runes";
import type { CourseVisit } from "../types.ts";
import { bookmarkService } from "./bookmarks.svelte.ts";
import { tutorsConnectService } from "./connect.svelte.ts";

/** Progression for the whole home page: none signed out, unavailable when the data API does not answer. */
export type HomeProgress =
  | { kind: "signed-out" }
  | { kind: "unavailable" }
  | { kind: "ready"; courses: Record<string, CourseProgress | null>; teaching: string[] };

/** One course card's progression: a count, "unavailable" when it could not be read, or null when not shown. */
export type CardProgress = CourseProgress | "unavailable" | null;

/** Bookmarks for the home page: null when no one is signed in, "unavailable" when the data API does not answer. */
export type HomeBookmarks = Bookmark[] | "unavailable" | null;

export interface HomeView {
  visits: CourseVisit[];
  progress: HomeProgress;
  bookmarks: HomeBookmarks;
}

/** Progression for the signed-in user; asks the data API for nothing when no one is signed in (Rule 0078). */
export async function loadProgress(): Promise<HomeProgress> {
  if (!tutorsId.value?.login) return { kind: "signed-out" };
  const home = await dataApi.getHome();
  return home ? { kind: "ready", courses: home.courses, teaching: home.teaching ?? [] } : { kind: "unavailable" };
}

export async function loadBookmarks(): Promise<HomeBookmarks> {
  if (!tutorsId.value?.login) return null;
  return (await bookmarkService.load()) ?? "unavailable";
}

export async function loadHome(): Promise<HomeView> {
  const [visits, progress, bookmarks] = await Promise.all([tutorsConnectService.getCourseVisits(), loadProgress(), loadBookmarks()]);
  return { visits, progress, bookmarks };
}

export function cardProgress(progress: HomeProgress, courseId: string): CardProgress {
  if (progress.kind === "signed-out") return null;
  if (progress.kind === "unavailable") return "unavailable";
  return progress.courses[courseId] ?? "unavailable";
}

/** The visited courses the user teaches, in profile order (Rule 0154). */
export function teachingVisits(progress: HomeProgress, visits: CourseVisit[]): CourseVisit[] {
  if (progress.kind !== "ready") return [];
  return visits.filter((v) => progress.teaching.includes(v.id));
}
