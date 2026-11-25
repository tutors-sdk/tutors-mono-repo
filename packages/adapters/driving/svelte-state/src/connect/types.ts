import type { IdentityClient } from "@tutors/application/ports";
import type { Course, TutorsId } from "@tutors/domain/course";
import type { CourseVisit } from "@tutors/domain/presence";

export type ConnectUser = Pick<TutorsId, "login" | "name" | "email" | "image">;

export type { CourseVisit };

/**
 * Service for managing user authentication and course access
 */
export interface TutorsConnectService {
  identityClient: IdentityClient | null;
  intervalId: any;
  /** True while the reader runs with no learner record: nothing recorded, nobody present, no sign-in. */
  readonly anonMode: boolean;

  connect(redirectStr: string): Promise<void>;
  reconnect(user: ConnectUser): Promise<void>;
  disconnect(redirectStr: string): Promise<void>;
  toggleShare(): void;
  /** Persists sentiment locally and, when signed in, in the learner's record. */
  updateSentiment(sentiment: string): Promise<void>;

  courseVisit(course: Course): void;
  deleteCourseVisit(courseId: string): Promise<void>;
  getCourseVisits(): Promise<CourseVisit[]>;
  favouriteCourse(courseId: string): Promise<void>;
  unfavouriteCourse(courseId: string): Promise<void>;

  /** Identity of the last reported learning event, so a repeat of it can be dropped. */
  lastLearningEvent: string;
  /** Set by {@link TutorsConnectService.navigated}; makes the next learning event report. */
  pendingNavigation: boolean;
  /** True from {@link TutorsConnectService.navigating} until {@link TutorsConnectService.navigated}; no learning event reports meanwhile. */
  navigationInFlight: boolean;
  /** Number of the latest navigation that changes page, so a stale cancellation releases nothing. */
  navigationAttempt: number;
  /** Tells the service a navigation from one path to another has started, so nothing is reported until it lands. */
  navigating(from?: string, to?: string): number;
  /** Releases the hold {@link TutorsConnectService.navigating} set, when that navigation was cancelled. */
  navigationAbandoned(attempt: number): void;
  /** Tells the service the student arrived at a page, so the next report is a genuine page load; a same-path arrival is not one. */
  navigated(from?: string, to?: string): void;
  learningEvent(params: Record<string, string>): void;
  startTimer(): void;
  stopTimer(): void;

  checkWhiteList(): void;
}
