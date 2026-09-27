import { json, type RequestHandler } from "@sveltejs/kit";
import type { Home } from "@tutors/data-api";
import { authorization } from "../../../lib/server/api/access.ts";
import { AuthorizationUnavailableError } from "../../../lib/server/api/authorization.ts";
import { courseProgress, homeCourseIds, learningRecordsIn } from "../../../lib/server/api/home.ts";
import { requireDb, requireUser } from "../../../lib/server/api/http.ts";
import { getProfile } from "../../../lib/server/api/store.ts";

/** The signed-in user's progress in each course of their profile, and which of them they teach (Rules 0076, 0077, 0079, 0154). */
export const GET: RequestHandler = async ({ locals }) => {
  const user = await requireUser(locals);
  const db = requireDb();
  const courseIds = homeCourseIds(await getProfile(db, user.login));
  const records = await learningRecordsIn(db, user.login, courseIds);

  const teaching: string[] = [];
  const entries = await Promise.all(
    courseIds.map(async (courseId) => {
      try {
        const facts = await authorization().course(courseId);
        if (!facts) return [courseId, null] as const;
        if (await authorization().can(user, "analytics:view", { kind: "course", courseId })) teaching.push(courseId);
        return [courseId, courseProgress(facts.learningObjects, records.filter((r) => r.course_id === courseId))] as const;
      } catch (e) {
        // The course's host is down and no recent copy is held: say so rather than report nothing opened.
        if (e instanceof AuthorizationUnavailableError) return [courseId, null] as const;
        throw e;
      }
    })
  );
  // In profile order (most recent first), not the order the course reads finished in.
  const home: Home = { courses: Object.fromEntries(entries), teaching: courseIds.filter((id) => teaching.includes(id)) };
  return json(home);
};
