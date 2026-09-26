/**
 * Authentication and user connection management service.
 * Handles user authentication, course access, analytics tracking, and presence management.
 * Supports both authenticated and anonymous modes.
 */

import { signOut } from "@auth/sveltekit/client";
import { signIn } from "@auth/sveltekit/client";
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import type { Course } from "@tutors/tutors-model-lib";

import { analyticsService, presenceService } from "@tutors/community";
import { env } from "$env/dynamic/public";

import { currentCourse, currentLo, tutorsId, isEducator } from "@tutors/runes";
import { rbacService } from "@tutors/rbac";
import { consent, readConsent, saveConsent } from "@tutors/privacy";
import { localStorageProfile } from "./localStorageProfile.ts";

import { updateCourseList } from "../utils/allCourseAccess.ts";
import { type CourseVisit, type TutorsConnectService, type TutorsId } from "../types.ts";
import { supabaseProfile } from "./supabaseProfile.svelte.ts";
import {
  addOrUpdateStudent,
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
      if (browser) {
        consent.value = readConsent(user.login);
        user.share = consent.value?.presence ? "true" : "false";
      }
      tutorsId.value = user;
      tutorsId.value.sentiment! = (await getTutorsConnectUserSentiment(user.login)) ?? "neutral";
      if (browser && localStorage.loginCourse) {
        const courseId = localStorage.loginCourse;
        localStorage.removeItem("loginCourse");
        goto(`/course/${courseId}`);
      }
      addOrUpdateStudent(user).catch((err) => log.error("Failed to update student record:", err));
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
    this.setConsent({ analytics: consent.value?.analytics ?? false, presence: tutorsId.value?.share !== "true" });
  },

  setConsent(choice: { analytics: boolean; presence: boolean }) {
    const login = tutorsId.value?.login;
    if (!login || !browser) return;
    consent.value = saveConsent(login, choice);
    tutorsId.value!.share = choice.presence ? "true" : "false";
    if (!anonMode) {
      void updateTutorsConnectUserOnlineStatus(login, choice.presence ? "online" : "offline").catch((err) => log.error("Failed to update online status:", err));
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

  /**
   * Records a learning event and broadcasts if sharing enabled
   * @param params - Event parameters to record
   */
  learningEvent(params: Record<string, string>): void {
    if (anonMode) return;
    if (currentCourse.value && currentLo.value && tutorsId.value) {
      if (analyticsEnabled && consent.value?.analytics) analyticsService.learningEvent(currentCourse.value, params, currentLo.value, tutorsId.value);
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
        if (analyticsEnabled && consent.value?.analytics) analyticsService.updatePageCount(currentCourse.value, currentLo.value, tutorsId.value);
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
