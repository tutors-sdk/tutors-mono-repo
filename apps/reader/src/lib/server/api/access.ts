import { env } from "$env/dynamic/private";
import { createCourseAccess, listFromEnv, type CourseAccess } from "./course-access.ts";

let access: CourseAccess | undefined;

/** The reader's one course-access cache, configured from the private environment. */
export function courseAccess(): CourseAccess {
  access ??= createCourseAccess({
    fetch,
    allowedHosts: listFromEnv(env.PRIVATE_COURSE_HOSTS),
    admins: listFromEnv(env.PRIVATE_TUTORS_ADMINS)
  });
  return access;
}

/** Origins (the time and live apps) allowed to read /api/time with the reader's session cookie. */
export function allowedOrigins(): string[] {
  return listFromEnv(env.PRIVATE_API_ALLOWED_ORIGINS);
}
