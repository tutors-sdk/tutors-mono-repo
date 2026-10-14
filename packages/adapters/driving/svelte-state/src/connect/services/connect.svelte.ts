/**
 * Authentication and user connection management service.
 * Handles user authentication, course access, analytics tracking, and presence management.
 * Which learner record, presence and sign-in it talks to is decided by the app's composition root
 * (`configureAdapters`); with the anonymous set in place it records nothing and offers no sign-in.
 */

import { browser } from "$app/env";
import { goto } from "$app/navigation";
import type { Course } from "@tutors/domain/course";
import { courseAdmission, forgetCourseVisit, setFavouriteCourse, visitCourse } from "@tutors/application";
import type { ProfilePort } from "@tutors/application/ports";
import { parseSentiment } from "@tutors/domain/presence";

import { adapters } from "../../adapters.ts";
import { analyticsService, presenceService } from "../../community/index.ts";
import { currentCourse, currentLo, tutorsId } from "../../index.svelte.ts";
import { rbacService } from "../../rbac/index.ts";
import { type ConnectUser, type CourseVisit, type TutorsConnectService } from "../types.ts";
import log from "@tutors/logger";

/** Global flag to disable analytics in case of database issues*/
export let analyticsEnabled = true;

/** The learner's record: the store's once signed in, the browser's otherwise. */
function profile(): ProfilePort {
  const { local, signedIn } = adapters().profile;
  return tutorsId.value?.login && signedIn ? signedIn : local;
}

function learnerId(): string {
  return tutorsId.value?.login ?? "";
}

export const tutorsConnectService: TutorsConnectService = {
  identityClient: null,
  /** Timer ID for analytics updates */
  intervalId: null,

  get anonMode(): boolean {
    return adapters().anonymous;
  },

  /**
   * Initiates GitHub OAuth authentication flow
   * @param redirectStr - URL to redirect to after successful authentication
   */
  async connect(redirectStr: string) {
    const client = this.identityClient ?? adapters().identityClient;
    if (!client) throw new Error("Identity client is not configured");
    return client.signIn(redirectStr);
  },

  /**
   * Re-establishes user session and connections
   * Switches to the stored profile and handles course redirects
   * @param user - User identity to reconnect
   */
  async reconnect(user: ConnectUser) {
    if (this.anonMode) return;
    if (user) {
      tutorsId.value = { ...user, share: "true", sentiment: "neutral" };
      const stored = profile();
      tutorsId.value.sentiment! = (await stored.getSentiment(user.login)) ?? "neutral";
      const sharing = await stored.getSharing(user.login);
      tutorsId.value.share = sharing === null ? "online" : String(sharing);
      analyticsService.updateLogin("", { user: tutorsId.value }).catch((err) => log.error("Failed to update student record:", err));
      if (browser) {
        if (!localStorage.share) {
          localStorage.share = true;
        }
        tutorsId.value.share = localStorage.share;
        if (localStorage.loginCourse) {
          const courseId = localStorage.loginCourse;
          localStorage.removeItem("loginCourse");
          goto(`/course/${courseId}`);
        }
        if (currentCourse.value && tutorsId.value.share === "true") {
          void presenceService.startCourseRoster(currentCourse.value.courseId);
        }
      }
    }
  },

  /**
   * Terminates user session
   * @param redirectStr - URL to redirect to after logout
   */
  async disconnect(redirectStr: string) {
    const client = this.identityClient ?? adapters().identityClient;
    if (!client) throw new Error("Identity client is not configured");
    return client.signOut(redirectStr);
  },

  /**
   * Toggles user's content sharing preference
   * Updates both local storage and current session
   */
  toggleShare() {
    if (tutorsId.value && browser) {
      if (tutorsId.value.share === "true") {
        localStorage.share = tutorsId.value.share = "false";
      } else {
        localStorage.share = tutorsId.value.share = "true";
      }
      const login = tutorsId.value.login;
      if (tutorsId.value.share === "true" && login && currentCourse.value) {
        void presenceService.startCourseRoster(currentCourse.value.courseId);
      } else {
        presenceService.stopPresenceListener();
      }
      if (login && !this.anonMode) {
        void profile()
          .setSharing(login, tutorsId.value.share === "true")
          .catch((err) => log.error("Failed to update online status:", err));
      }
    }
  },

  async updateSentiment(sentiment: string) {
    const s = sentiment;
    if (browser) {
      localStorage.sentiment = s;
    }
    if (this.anonMode) return;
    if (tutorsId.value) {
      tutorsId.value = { ...tutorsId.value, sentiment: s };
    }
    const login = tutorsId.value?.login;
    const parsed = parseSentiment(s);
    if (login && parsed) {
      await profile().setSentiment(login, parsed);
    }
  },

  /**
   * Records a course visit and manages associated services
   * Handles auth redirects for protected courses
   * @param course - Course being visited
   */
  courseVisit(course: Course) {
    // Locks gate what students can see, so they must load even in anonymous mode -
    // otherwise `locksLoaded` never becomes true and the course renders empty.
    if (course.hasEnrollment) {
      void rbacService.loadContentLocks(course.courseId);
    } else {
      rbacService.clear();
    }
    if (this.anonMode) return;
    if (analyticsEnabled) {
      const { publisher, clock } = adapters();
      void publisher.publish({ type: "course-visit", learnerId: learnerId(), course }).catch((err) => log.error("Failed to publish course visit:", err));
      void visitCourse({ profile: profile(), clock })(learnerId(), course).catch((err) => log.error("Failed to log course visit:", err));
    }
    if (tutorsId.value?.login && tutorsId.value.share === "true") {
      void presenceService.startCourseRoster(course.courseId);
    } else {
      presenceService.stopPresenceListener();
    }
    if (courseAdmission(course, tutorsId.value?.login) === "sign-in") {
      localStorage.loginCourse = course.courseId;
      goto(`/auth`);
    }
    if (course.hasEnrollment && tutorsId.value?.login) {
      rbacService.loadRole(tutorsId.value.login, course.courseId, course);
      rbacService.checkLecturerStatus(course);
    }
  },

  async favouriteCourse(courseId: string) {
    await setFavouriteCourse({ profile: profile() })(learnerId(), courseId, true);
  },

  async unfavouriteCourse(courseId: string) {
    await setFavouriteCourse({ profile: profile() })(learnerId(), courseId, false);
  },

  async deleteCourseVisit(courseId: string) {
    await forgetCourseVisit({ profile: profile() })(learnerId(), courseId);
  },

  getCourseVisits(): Promise<CourseVisit[]> {
    return profile().getCourseVisits(learnerId());
  },

  lastLearningEvent: "",
  /** The first page of a session is arrived at, so there is a navigation to report from the start. */
  pendingNavigation: true,

  /**
   * Nothing is reported while a navigation is in flight. The destination's load sets `currentLo` before
   * SvelteKit commits the new `page.params`, so a report taken mid-flight pairs the page being left with
   * the learning object being arrived at, and counts a page load nobody made. Starts true: the first page
   * of a session is still being arrived at until the layout's first `afterNavigate`.
   */
  navigationInFlight: true,
  navigationAttempt: 0,

  /**
   * A navigation has started. One that keeps the path - an anchor, the skip link, a search filter - is
   * not a move to another page, so it holds nothing. Returns the attempt, for {@link navigationAbandoned}.
   */
  navigating(from?: string, to?: string): number {
    if (from !== undefined && from === to) return this.navigationAttempt;
    this.navigationInFlight = true;
    return ++this.navigationAttempt;
  },

  /** A navigation was cancelled before it landed, so no `afterNavigate` will release the hold it set. */
  navigationAbandoned(attempt: number): void {
    if (attempt === this.navigationAttempt) this.navigationInFlight = false;
  },

  navigated(from?: string, to?: string): void {
    this.navigationInFlight = false;
    if (from !== undefined && from === to) return;
    this.pendingNavigation = true;
  },

  /**
   * Records a learning event and broadcasts if sharing enabled
   *
   * Reports once per page the student arrives at. The course layout calls this from an `$effect`
   * tracking the course, the learning object and the id, so one navigation runs it several times as
   * those resolve: once with the previous learning object still in place, again when the new one
   * arrives, again when the id settles. Each repeat cost a page-load count the student had not made
   * and a broadcast to every other student in the course.
   *
   * Two things make an event worth reporting, and payload alone cannot tell them apart. A navigation
   * means the student went somewhere, including back to a page they had already read, which is a
   * second genuine page load. A change in the payload - a new learning object, or a mood Tutors Live
   * renders - means something worth telling others even with no navigation. A repeat of the same
   * payload with no navigation behind it is neither, and is the only case dropped here.
   *
   * @param params - Event parameters to record
   */
  learningEvent(params: Record<string, string>): void {
    if (this.anonMode || this.navigationInFlight) return;
    if (currentCourse.value && currentLo.value && tutorsId.value) {
      const identity = [params.loid ?? "", currentLo.value.route, tutorsId.value.login ?? "", tutorsId.value.sentiment ?? "", tutorsId.value.share ?? ""].join("|");
      if (!this.pendingNavigation && identity === this.lastLearningEvent) return;
      this.pendingNavigation = false;
      this.lastLearningEvent = identity;

      if (analyticsEnabled) analyticsService.learningEvent(currentCourse.value, params, currentLo.value, tutorsId.value);
      if (tutorsId.value.share === "true" && !currentCourse.value.isPrivate) {
        presenceService.sendLoEvent(currentCourse.value, currentLo.value, tutorsId.value);
      }
    }
  },

  /**
   * Starts periodic analytics update timer
   * Updates page counts every 30 seconds when page is visible
   */
  startTimer() {
    if (this.anonMode) return;
    this.intervalId = setInterval(() => {
      if (!document.hidden && currentCourse.value && currentLo.value && tutorsId.value) {
        if (analyticsEnabled) analyticsService.updatePageCount(currentCourse.value, currentLo.value, tutorsId.value);
      }
    }, 30 * 1000);
  },

  /**
   * Stops analytics update timer
   */
  stopTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  },

  checkWhiteList(): void {
    const course = currentCourse.value;
    if (!course?.authLevel || course.authLevel < 1) return;
    if (!course.enrollment?.whitelist?.length) return;
    if (courseAdmission(course, tutorsId.value?.login) !== "admit") {
      goto(`/`);
    }
  }
};
