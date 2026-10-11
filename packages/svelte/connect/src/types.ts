import type { IdentityClient } from "@tutors/identity";
import type { Course, IconType, TutorsId } from "@tutors/tutors-model-lib";

export type ConnectUser = Pick<TutorsId, "login" | "name" | "email" | "image">;

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
  identityClient: IdentityClient | null;
  intervalId: any;
  anonMode: boolean;

  connect(redirectStr: string): Promise<void>;
  reconnect(user: ConnectUser): Promise<void>;
  disconnect(redirectStr: string): Promise<void>;
  toggleShare(): void;
  /** Persists sentiment locally and, when signed in, in tutors-connect-users. */
  updateSentiment(sentiment: string): Promise<void>;

  courseVisit(course: Course): void;
  deleteCourseVisit(courseId: string): void;
  getCourseVisits(): Promise<CourseVisit[]>;
  favouriteCourse(courseId: string): void;
  unfavouriteCourse(courseId: string): void;

  /** Identity of the last reported learning event, so a repeat of it can be dropped. */
  lastLearningEvent: string;
  /** Set by {@link TutorsConnectService.navigated}; makes the next learning event report. */
  pendingNavigation: boolean;
  /** Tells the service the student arrived at a page, so the next report is a genuine page load. */
  navigated(): void;
  learningEvent(params: Record<string, string>): void;
  startTimer(): void;
  stopTimer(): void;

  checkWhiteList(): void;
}
