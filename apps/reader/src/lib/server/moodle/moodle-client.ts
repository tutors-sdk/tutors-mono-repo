/**
 * The reader's Moodle (Rules 0633-0634): the moodle adapter composed from this server's private
 * environment (MOODLE_WS_URL, MOODLE_WS_TOKEN, MOODLE_WS_REST_FORMAT); the token never leaves the
 * server. The functions and types below are what the sync services import from here.
 */
import * as env from "$app/env/private";
import { moodleAssignmentSource } from "@tutors/moodle";

export type {
  CourseContentsOptions,
  MoodleAssignSubmission,
  MoodleAssignSubmissionsResponse,
  MoodleModule
} from "@tutors/application/ports";

/** True when the reader has the Moodle web-service URL and token it needs to sync. */
export function moodleConfigured(): boolean {
  return Boolean(env.MOODLE_WS_URL && env.MOODLE_WS_TOKEN);
}

const moodle = moodleAssignmentSource({ url: env.MOODLE_WS_URL, token: env.MOODLE_WS_TOKEN, restFormat: env.MOODLE_WS_REST_FORMAT });

export const getCourseContents = moodle.courseContents;
export const getAssignmentSubmissions = moodle.assignmentSubmissions;
