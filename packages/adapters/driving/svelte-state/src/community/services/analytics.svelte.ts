/**
 * Analytics: what the reader records as a learner moves through a course, through the
 * recordLearningEvent and recordHeartbeat use cases and whichever LearningEventSink the app composed.
 */
import type { Course, Lo, TutorsId } from "@tutors/domain/course";
import { recordHeartbeat, recordLearningEvent } from "@tutors/application";
import { adapters } from "../../adapters.ts";
import type { AnalyticsService } from "../types.svelte.ts";
import log from "@tutors/logger";

function deps() {
  const { learningEvents, clock, publisher } = adapters();
  return { events: learningEvents, clock, publish: publisher.publish.bind(publisher) };
}

export const analyticsService: AnalyticsService = {
  /** Current learning object route being tracked */
  loRoute: "",
  /** The step id (a lab step, a notebook cell) the route above was built with, if any. */
  stepId: undefined as string | undefined,

  /**
   * Records a learning event for a specific learning object
   * Handles both direct and nested learning object routes
   */
  learningEvent(course: Course, params: Record<string, string>, lo: Lo, student: TutorsId) {
    try {
      this.stepId = params.loid || undefined;
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

  /** Records a page load through the composed sink. */
  reportPageLoad(course: Course, lo: Lo, student: TutorsId) {
    try {
      void recordLearningEvent(deps())(student, course, lo, this.stepId).catch((error: unknown) => log.error("TutorStore Error:", error));
    } catch (error: unknown) {
      log.error("TutorStore Error:", error);
    }
  },

  /** The 30-second tick: time against the learning object on screen, and the day. */
  updatePageCount(course: Course, lo: Lo, student: TutorsId) {
    try {
      if (student) {
        void recordHeartbeat(deps())(student, course, lo.route ? lo : null, this.stepId).catch((error: unknown) => log.error("TutorStore Error:", error));
      }
    } catch (error: unknown) {
      log.error("TutorStore Error:", error);
    }
  },

  /** Updates or creates the learner's record on login. */
  async updateLogin(courseId: string, session: { user: TutorsId }) {
    try {
      const user = session.user;
      await (adapters().profile.signedIn ?? adapters().profile.local).upsertLearner({
        login: user.login,
        name: user.name ?? null,
        email: user.email ?? null,
        image: user.image ?? null,
        sentiment: user.sentiment ?? null,
        sharing: user.share === "true" ? true : user.share === "false" ? false : null
      });
    } catch (error: unknown) {
      log.error("TutorStore Error:", error);
    }
  }
};
