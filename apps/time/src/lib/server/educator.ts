/**
 * Server-side educator authorisation for the lecturer dashboard (issue #155).
 *
 * Snippet data is closed to the anon role at the database level, so every read
 * has to come through a server route holding the service-role key. This module
 * is the gate in front of that key: it answers "is this signed-in user an
 * educator of this course?" and nothing else.
 *
 * Educator membership is the existing RBAC model (guides/RBAC.md): the
 * `educators` list in the course's `enrollment.yaml`, which the course builder
 * serialises into the published `tutors.json`. We fetch that file rather than
 * duplicating the list into Supabase, so there is exactly one source of truth
 * and no sync step at publish time.
 *
 * Do not use the course PIN for this. It is delivered to the browser by a
 * universal `load` and compared client-side, so it identifies nobody.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { courseJsonUrl } from "@tutors/tutors-time-lib";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { env } from "$env/dynamic/private";
import log from "@tutors/logger";
import type { RequestEvent } from "@sveltejs/kit";

/** Cache tutors.json educator lists briefly — a dashboard does many reads. */
const CACHE_TTL_MS = 5 * 60 * 1000;
const educatorCache = new Map<string, { educators: string[]; fetchedAt: number }>();

/**
 * A Supabase client bound to the service-role key.
 *
 * Callers MUST have authorised the request first — this key bypasses RLS.
 */
export function serviceClient(): SupabaseClient {
  const serviceKey = env.PRIVATE_SUPABASE_SERVICE_KEY;
  if (!PUBLIC_SUPABASE_URL || !serviceKey) {
    throw Error("Supabase is not configured for snippet sharing");
  }
  return createClient(PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false }
  });
}

/** The `educators` list from a course's published tutors.json (never throws). */
async function courseEducators(courseId: string, fetchFn: typeof fetch): Promise<string[]> {
  const cached = educatorCache.get(courseId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.educators;
  }

  const url = courseJsonUrl(courseId);

  let educators: string[] = [];
  try {
    const res = await fetchFn(url);
    if (res.ok) {
      const course = (await res.json()) as { enrollment?: { educators?: string[] } };
      educators = course.enrollment?.educators ?? [];
    } else {
      log.warn(`Could not read enrollment for ${courseId}: HTTP ${res.status}`);
    }
  } catch (e) {
    log.warn(`Could not read enrollment for ${courseId}:`, e);
  }

  educatorCache.set(courseId, { educators, fetchedAt: Date.now() });
  return educators;
}

export type EducatorCheck =
  | { ok: true; login: string }
  | { ok: false; reason: "anonymous" | "not-educator" | "no-enrollment" };

/**
 * Authorise the caller as an educator of `courseId`.
 *
 * Fails closed: a course with no `enrollment.yaml`, or one whose tutors.json
 * could not be read, has no educators and therefore grants nobody access. That
 * is deliberate — the alternative (treating "no list" as "everyone") would
 * expose snippets for every course that has not adopted enrollment.yaml.
 */
export async function requireEducator(event: RequestEvent, courseId: string): Promise<EducatorCheck> {
  const session = await event.locals.auth();
  const login = session?.user?.login;
  if (!login) return { ok: false, reason: "anonymous" };

  const educators = await courseEducators(courseId, event.fetch);
  if (educators.length === 0) return { ok: false, reason: "no-enrollment" };
  if (!educators.includes(login)) return { ok: false, reason: "not-educator" };

  return { ok: true, login };
}

/** Test seam — drop the tutors.json cache. */
export function __clearEducatorCache(): void {
  educatorCache.clear();
}
