/**
 * The application's ports over the data API: what a signed-in browser may write, and read about
 * itself, goes to the reader's server, which knows the caller from the session and checks what they
 * may do. No function here takes or sends a learner's identity; the `learnerId` arguments of the
 * ports are ignored on purpose, so a browser cannot write as someone else (Rule 0072).
 */
import type { AccessStore, CourseCatalogue, LearningEventSink, PresencePort, ProfilePort, WhiteboardStore } from "@tutors/application/ports";
import type { LockWrite } from "@tutors/domain/access";
import { parseSentiment, parseSharing, onlineStatusFor, type CourseVisit } from "@tutors/domain/presence";
import log from "@tutors/logger";
import { dataApi } from "./client.ts";

/** Page loads and 30-second ticks, recorded by POST /api/analytics under the session's login. */
export function dataApiLearningEventSink(): LearningEventSink {
  return {
    async record(event) {
      await dataApi.recordAnalytics(event);
    }
  };
}

/** 401 is a visitor who is not signed in and 503 a server with nowhere to save: neither is a failure to report. */
function failed(response: Response | null, ...expected: number[]): response is Response {
  return !!response && !response.ok && !expected.includes(response.status);
}

/** The signed-in learner's own record: visit history (/api/profile), sentiment and sharing (/api/me). */
export function dataApiProfile(): ProfilePort {
  // A read that fails or comes back empty keeps the last list read, so a save that follows cannot wipe the stored history.
  let visits: CourseVisit[] = [];
  return {
    async getCourseVisits() {
      const profile = await dataApi.getProfile<CourseVisit>();
      if (profile && profile.courseVisits.length > 0) visits = profile.courseVisits;
      return structuredClone(visits);
    },
    async saveCourseVisits(_learnerId, courseVisits) {
      visits = structuredClone(courseVisits);
      const response = await dataApi.saveProfile({ courseVisits });
      if (response && !response.ok) log.error("Failed to save profile:", { status: response.status });
    },
    async upsertLearner(profile) {
      const sentiment = parseSentiment(profile.sentiment);
      const response = await dataApi.saveMe({
        ...(sentiment ? { sentiment } : {}),
        ...(profile.sharing === null ? {} : { onlineStatus: onlineStatusFor(profile.sharing) })
      });
      if (failed(response, 401, 503)) throw new Error(`Saving the student record failed with status ${response.status}`);
    },
    async getSentiment() {
      return parseSentiment((await dataApi.getMyStatus())?.sentiment);
    },
    async setSentiment(_learnerId, sentiment) {
      const response = await dataApi.changeMyStatus({ sentiment });
      if (failed(response, 401)) throw new Error(`Saving the sentiment failed with status ${response.status}`);
    },
    async getSharing() {
      return parseSharing((await dataApi.getMyStatus())?.online_status);
    },
    async setSharing(_learnerId, sharing) {
      const response = await dataApi.changeMyStatus({ onlineStatus: onlineStatusFor(sharing) });
      if (failed(response, 401)) throw new Error(`Saving the online status failed with status ${response.status}`);
    }
  };
}

/**
 * Lock changes go to PUT /api/courses/:id/locks (Rule 0630): the server checks the signed-in
 * educator and records who made the change; the browser never writes the table itself. "refused"
 * when the server rejects the change or cannot save it (4xx, 502, other 5xx); "unavailable" when it
 * has no database to save to (503); "unreachable" when the request never got an answer.
 */
export function dataApiLockWriter(): Pick<AccessStore, "setLock"> {
  return {
    async setLock(courseId, loRoute, locked): Promise<LockWrite> {
      if (!courseId || !loRoute) return "refused";
      const response = await dataApi.setLock({ courseId, loRoute, locked });
      if (!response) {
        log.error("upsertLock unreachable", { courseId, loRoute });
        return "unreachable";
      }
      if (response.ok) return "saved";
      log.warn("upsertLock not saved", { courseId, loRoute, status: response.status });
      return response.status === 503 ? "unavailable" : "refused";
    }
  };
}

/**
 * Where a sharing learner is: the reader's server publishes it to Tutors Live (POST
 * /api/live/activity) and keeps it as their latest snapshot (POST /api/presence), under the
 * session's identity.
 */
export function dataApiPresencePublisher(): Pick<PresencePort, "publish"> {
  return {
    async publish(event) {
      dataApi.reportLiveActivity(event);
      const courseId = event.courseId?.trim();
      if (courseId) await dataApi.reportPresence({ courseId, payload: event });
    }
  };
}

/** Whiteboard scenes through GET and PUT /api/whiteboard. */
export function dataApiWhiteboard(): WhiteboardStore {
  return {
    async load(room) {
      return (await dataApi.getWhiteboard(room))?.scene ?? null;
    },
    async save(room, elements) {
      return (await dataApi.saveWhiteboard({ ...room, elements }))?.ok ?? false;
    }
  };
}

/** Course visits for the public catalogue, counted by POST /api/courses/visit. */
export function dataApiCourseCatalogue(): CourseCatalogue {
  return {
    async recordVisit(courseId, record) {
      await dataApi.reportCourseVisit({ courseId, courseRecord: record as unknown as Record<string, unknown> });
    }
  };
}
