/**
 * The time app's Moodle: the moodle adapter composed from this server's environment. The
 * functions and types below are what the services always imported from here.
 */
import * as env from "$app/env/private";
import { moodleAssignmentSource } from "@tutors/moodle";

export type {
  CourseContentsOptions,
  MoodleAssignSubmission,
  MoodleAssignSubmissionPlugin,
  MoodleAssignSubmissionsByAssignment,
  MoodleAssignSubmissionsResponse,
  MoodleContentFile,
  MoodleModule,
  MoodleModuleContent,
  MoodleWarning
} from "@tutors/application/ports";

const moodle = moodleAssignmentSource({ url: env.MOODLE_WS_URL, token: env.MOODLE_WS_TOKEN, restFormat: env.MOODLE_WS_REST_FORMAT });

export const getCourseContents = moodle.courseContents;
export const getAssignmentSubmissions = moodle.assignmentSubmissions;
