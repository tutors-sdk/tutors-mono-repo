/**
 * @service Home
 * What the reader's home page shows: the courses in the profile and, for a signed-in student,
 * how far they have got in each (Rules 0076 to 0079).
 */

import { dataApi, type CourseProgress } from "@tutors/data-api";
import { tutorsId } from "@tutors/runes";
import type { CourseVisit } from "../types.ts";
import { tutorsConnectService } from "./connect.svelte.ts";

/** Progression for the whole home page: none signed out, unavailable when the data API does not answer. */
export type HomeProgress =
  | { kind: "signed-out" }
  | { kind: "unavailable" }
  | { kind: "ready"; courses: Record<string, CourseProgress | null> };

/** One course card's progression: a count, "unavailable" when it could not be read, or null when not shown. */
export type CardProgress = CourseProgress | "unavailable" | null;

export interface HomeView {
  visits: CourseVisit[];
  progress: HomeProgress;
}

/** Progression for the signed-in student; asks the data API for nothing when no one is signed in (Rule 0078). */
export async function loadProgress(): Promise<HomeProgress> {
  if (!tutorsId.value?.login) return { kind: "signed-out" };
  const home = await dataApi.getHome();
  return home ? { kind: "ready", courses: home.courses } : { kind: "unavailable" };
}

export async function loadHome(): Promise<HomeView> {
  const [visits, progress] = await Promise.all([tutorsConnectService.getCourseVisits(), loadProgress()]);
  return { visits, progress };
}

export function cardProgress(progress: HomeProgress, courseId: string): CardProgress {
  if (progress.kind === "signed-out") return null;
  if (progress.kind === "unavailable") return "unavailable";
  return progress.courses[courseId] ?? "unavailable";
}
