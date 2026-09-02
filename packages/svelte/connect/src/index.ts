/**
 * Re-exports connect service and types for easier imports
 * @module
 */

export { tutorsConnectService, analyticsEnabled } from "./services/connect.svelte.ts";
export type { TutorsId, CourseVisit, CourseSentimentId } from "./types.ts";
export { COURSE_SENTIMENT_IDS, trackableLoTypes } from "./types.ts";
