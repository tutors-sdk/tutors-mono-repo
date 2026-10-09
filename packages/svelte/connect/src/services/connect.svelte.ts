/**
 * Authentication and user connection management service.
 * Handles user authentication, course access, analytics tracking, and presence management.
 * Supports both authenticated and anonymous modes.
 */

import { signOut } from "@auth/sveltekit/client";
import { signIn } from "@auth/sveltekit/client";
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import type { Course, TutorsId } from "@tutors/tutors-model-lib";

import { analyticsService, presenceService } from "@tutors/community";
import { env } from "$env/dynamic/public";

import { currentCourse, currentLo, tutorsId, isEducator } from "@tutors/runes";
import { rbacService } from "@tutors/rbac";
import { localStorageProfile } from "./localStorageProfile.ts";

import { updateCourseList } from "../utils/allCourseAccess.ts";
import { type CourseVisit, type TutorsConnectService } from "../types.ts";
import { supabaseProfile } from "./supabaseProfile.svelte.ts";
import {
  addOrUpdateStudent,
  getTutorsConnectUserOnlineStatus,
  getTutorsConnectUserSentiment,
  updateTutorsConnectUserOnlineStatus,
  updateTutorsConnectUserSentiment
} from "@tutors/community/utils/supabase-client";
import log from "@tutors/logger";

/** Global anonymous mode flag, controlled by environment variable */
let anonMode = false;

/** Global flag to disable analytics in case of database issues*/
export let analyticsEnabled = true;

if (env.PUBLIC_ANON_MODE === "TRUE") {
  anonMode = true;
}

export const tutorsConnectService: TutorsConnectService = {
  /** Active user profile implementation */
  profile: localStorageProfile,
  /** Timer ID for analytics updates */
  intervalId: null,
  /** Local anonymous mode flag */
  anonMode: false,

  /**
   * Initiates GitHub OAuth authentication flow
   * @param redirectStr - URL to redirect to after successful authentication
   * @returns Promise from auth provider
   */
  async connect(redirectStr: string) {
    return await signIn("github", { callbackUrl: redirectStr });
  },

  /**
   * Re-establishes user session and connections
   * Switches to Supabase profile and handles course redirects
   * @param user - User identity to reconnect
   */

  async reconnect(user: TutorsId) {
    if (anonMode) return;
    presenceService.connectToAllCourseAccess();
    if (user) {
      this.profile = supabaseProfile;
      tutorsId.value = user;
      tutorsId.value.sentiment! = (await getTutorsConnectUserSentiment(user.login)) ?? "neutral";
      tutorsId.value.share = (await getTutorsConnectUserOnlineStatus(user.login)) ?? "online";
      addOrUpdateStudent(user).catch((err) => log.error("Failed to update student record:", err));
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
      }
    }
  },

  /**
   * Terminates user session
   * @param redirectStr - URL to redirect to after logout
   */
  disconnect(redirectStr: string) {
    signOut({ callbackUrl: redirectStr });
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
      if (login && !anonMode) {
        const onlineStatus = tutorsId.value.share === "true" ? "online" : "offline";
        void updateTutorsConnectUserOnlineStatus(login, onlineStatus).catch((err) => log.error("Failed to update online status:", err));
      }
    }
  },

  async updateSentiment(sentiment: string) {
    const s = sentiment;
    if (browser) {
      localStorage.sentiment = s;
    }
    if (anonMode) return;
    if (tutorsId.value) {
      tutorsId.value = { ...tutorsId.value, sentiment: s };
    }
    const login = tutorsId.value?.login;
    if (login) {
      await updateTutorsConnectUserSentiment(login, s);
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
    if (anonMode) return;
    if (analyticsEnabled) {
      updateCourseList(course);
      this.profile.logCourseVisit(course);
    }
    presenceService.startPresenceListener(course.courseId);
    if (course.authLevel! > 0 && !tutorsId.value?.login) {
      localStorage.loginCourse = course.courseId;
      goto(`/auth`);
    }
    if (course.hasEnrollment && tutorsId.value?.login) {
      rbacService.loadRole(tutorsId.value.login, course.courseId, course);
      rbacService.checkLecturerStatus(course);
    }
  },

  /**
   * Adds course to user's favorites
   * @param courseId - Course to favorite
   */
  async favouriteCourse(courseId: string) {
    await this.profile.favouriteCourse(courseId);
  },

  /**
   * Removes course from user's favorites
   * @param courseId - Course to unfavorite
   */
  async unfavouriteCourse(courseId: string) {
    await this.profile.unfavouriteCourse(courseId);
  },

  /**
   * Deletes a course visit record
   * @param courseId - Course visit to delete
   */
  async deleteCourseVisit(courseId: string) {
    await this.profile.deleteCourseVisit(courseId);
  },

  /**
   * Retrieves user's course visit history
   * @returns Promise resolving to array of course visits
   */
  getCourseVisits(): Promise<CourseVisit[]> {
    return this.profile.getCourseVisits();
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

  navigating(): void {
    this.navigationInFlight = true;
  },

  navigated(): void {
    this.navigationInFlight = false;
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
    if (anonMode || this.navigationInFlight) return;
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
    if (anonMode) return;
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
    const enrollment = course.enrollment;
    if (enrollment?.whitelist && enrollment.whitelist.length > 0) {
      if (!tutorsId.value?.login) {
        goto(`/`);
      } else {
        const login = tutorsId.value.login;
        const isEducator = enrollment.educators?.includes(login) ?? false;
        if (!isEducator && !enrollment.whitelist.includes(login)) {
          goto(`/`);
        }
      }
    }
  }
};
