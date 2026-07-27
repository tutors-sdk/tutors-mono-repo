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
