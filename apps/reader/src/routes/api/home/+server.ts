import { json, type RequestHandler } from "@sveltejs/kit";
import type { Home } from "@tutors/data-api";
import { authorization } from "../../../lib/server/api/access.ts";
import { AuthorizationUnavailableError } from "../../../lib/server/api/authorization.ts";
import { courseProgress, homeCourseIds, learningRecordsIn } from "../../../lib/server/api/home.ts";
import { requireDb, requireUser } from "../../../lib/server/api/http.ts";
import { getProfile } from "../../../lib/server/api/store.ts";

/** The signed-in student's progress in each course of their profile (Rules 0076, 0077, 0079). */
export const GET: RequestHandler = async ({ locals }) => {
  const user = await requireUser(locals);
  const db = requireDb();
  const courseIds = homeCourseIds(await getProfile(db, user.login));
  const records = await learningRecordsIn(db, user.login, courseIds);

  const entries = await Promise.all(
    courseIds.map(async (courseId) => {
      try {
        const facts = await authorization().course(courseId);
        if (!facts) return [courseId, null] as const;
        return [courseId, courseProgress(facts.learningObjects, records.filter((r) => r.course_id === courseId))] as const;
      } catch (e) {
        // The course's host is down and no recent copy is held: say so rather than report nothing opened.
        if (e instanceof AuthorizationUnavailableError) return [courseId, null] as const;
        throw e;
      }
    })
  );
  const home: Home = { courses: Object.fromEntries(entries) };
  return json(home);
};
