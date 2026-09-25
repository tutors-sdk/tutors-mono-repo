import { env } from "$env/dynamic/private";
import { createCourseAccess, listFromEnv, type CourseAccess } from "./course-access.ts";

let access: CourseAccess | undefined;

export function courseAccess(): CourseAccess {
  access ??= createCourseAccess({
    fetch,
    allowedHosts: listFromEnv(env.PRIVATE_COURSE_HOSTS),
    admins: listFromEnv(env.PRIVATE_TUTORS_ADMINS)
  });
  return access;
}

export function allowedOrigins(): string[] {
  return listFromEnv(env.PRIVATE_API_ALLOWED_ORIGINS);
}
