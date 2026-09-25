/**
 * Analytics service for tracking user interactions and learning progress.
 * Persists through the reader's /api routes, which store each record under the signed-in session's login.
 * Handles learning events, page loads, and duration tracking.
 */

import type { TutorsId } from "@tutors/tutors-model-lib";
import type { Course, Lo } from "@tutors/tutors-model-lib";
import { recordLearningPageLoad, recordLearningTick, addOrUpdateStudent } from "../utils/supabase-client.ts";
import type { AnalyticsService } from "../types.svelte.ts";
import log from "@tutors/logger";

export const analyticsService: AnalyticsService = {
  /** Current learning object route being tracked */
  loRoute: "",

  /**
   * Records a learning event for a specific learning object
   * Handles both direct and nested learning object routes
   * @param course - Current course context
   * @param params - Event parameters including optional learning object ID
   * @param lo - Learning object being interacted with
   * @param student - Student performing the interaction
   */
  learningEvent(course: Course, params: Record<string, string>, lo: Lo, student: TutorsId) {
    try {
      if (params.loid) {
        const targetRouteParts = lo.route.split("/");
        const trimmedTargetRoute = targetRouteParts.slice(0, 3).join("/");
        this.loRoute = trimmedTargetRoute + "/" + params.loid;
      } else {
        this.loRoute = lo.route;
      }
      this.reportPageLoad(course, lo, student);
    } catch (error: unknown) {
      log.error("TutorStore Error:", error);
    }
  },

  /**
   * Records a page load event through the reader's server
   * Creates or updates learning object interaction record
   * @param course - Current course
   * @param lo - Learning object being viewed
   * The student is not sent: the server records the page load under the session's login.
   */
  reportPageLoad(course: Course, lo: Lo) {
    try {
      void recordLearningPageLoad(course, this.loRoute, lo);
    } catch (error: unknown) {
      log.error("TutorStore Error:", error);
    }
  },

  /**
   * Updates analytics for time spent on learning objects
   * Tracks both individual learning object and calendar-based durations
   * @param course - Current course
   * @param lo - Learning object being tracked
   * @param student - Student to update analytics for
   */
  updatePageCount(course: Course, lo: Lo, student: TutorsId) {
    try {
      if (student) {
        void recordLearningTick(course.courseId, lo.route ? this.loRoute : null);
      }
    } catch (error: unknown) {
      log.error("TutorStore Error:", error);
    }
  },

  /**
   * Updates or creates student record on login
   * Ensures student data is synchronized with auth state
   * @param courseId - Course being accessed
   * @param session - Authentication session data
   */
  async updateLogin(courseId: string, session: { user: TutorsId }) {
    try {
      await addOrUpdateStudent(session.user);
    } catch (error: unknown) {
      log.error("TutorStore Error:", error);
    }
  }
};
