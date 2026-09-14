import type { IconType } from "./icon-types.ts";

/**
 * User identity and authentication types
 */

/**
 * User identity and profile information from authentication
 */
export type TutorsId = {
  name: string;
  login: string;
  email: string;
  image: string;
  share: string;
  sentiment: string;
};

/**
 * Available sentiment options for course feedback
 */
export const COURSE_SENTIMENT_IDS = ["neutral", "fine", "delighted", "confident", "overwhelmed", "confused", "drained"] as const;
export type CourseSentimentId = (typeof COURSE_SENTIMENT_IDS)[number];

/**
 * Minimal user information attached to learning object interactions
 * (presence broadcasts, student cards, live dashboards)
 */
export interface LoUser {
  fullName: string;
  avatar: string;
  id: string;
  sentiment: string;
}

/**
 * Plain-data record of a user's interaction with a learning object.
 * Framework-free shape shared by presence payloads, the live dashboard
 * and student cards; the community package's reactive LoRecord implements it.
 */
export interface LoEventRecord {
  courseId: string;
  courseUrl: string;
  courseTitle: string;
  loRoute: string;
  title: string;
  img?: string;
  icon?: IconType;
  isPrivate: boolean;
  user?: LoUser;
  type: string;
}
