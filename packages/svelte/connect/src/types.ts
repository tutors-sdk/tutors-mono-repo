import type { Course, IconType } from "@tutors/tutors-model-lib";
import type { TutorsId as TutorsIdType, CourseSentimentId as CourseSentimentIdType } from "@tutors/tutors-model-lib";
import { COURSE_SENTIMENT_IDS as SENTIMENT_IDS } from "@tutors/tutors-model-lib";

/**
 * Re-exports from @tutors/types for backward compatibility
 */
export type { TutorsIdType as TutorsId };
export type { CourseSentimentIdType as CourseSentimentId };
export { SENTIMENT_IDS as COURSE_SENTIMENT_IDS };

/**
 * Record of a user's interaction with a course
 */
export type CourseVisit = {
  id: string;
  title: string;
  img?: string;
  icon?: IconType;
  lastVisit: string;
  credits: string;
  visits?: number;
  private?: boolean;
  favourite?: boolean;
};

/**
 * Service for managing user profile data and course interactions
 */
export interface ProfileStore {
  /** List of courses visited by user */
  courseVisits: CourseVisit[];

  reload(): void;
  save(): void;
  logCourseVisit(course: Course): void;
  favouriteCourse(courseId: string): void;
  unfavouriteCourse(courseId: string): void;
  deleteCourseVisit(courseId: string): void;
  getCourseVisits(): Promise<CourseVisit[]>;
}

/**
 * Service for managing user authentication and course access
 */
export interface TutorsConnectService {
  profile: ProfileStore;
  intervalId: any;
  anonMode: boolean;

  connect(redirectStr: string): void;
  reconnect(user: TutorsIdType): void;
  disconnect(redirectStr: string): void;
  toggleShare(): void;
  /** Persists sentiment locally and, when signed in, in tutors-connect-users. */
  updateSentiment(sentiment: string): Promise<void>;

  courseVisit(course: Course): void;
  deleteCourseVisit(courseId: string): void;
  getCourseVisits(): Promise<CourseVisit[]>;
  favouriteCourse(courseId: string): void;
  unfavouriteCourse(courseId: string): void;

  learningEvent(params: Record<string, string>): void;
  startTimer(): void;
  stopTimer(): void;

  checkWhiteList(): void;
}
