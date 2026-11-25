import log from "@tutors/logger";
import type {
  AnalyticsEvent,
  CourseVisitReport,
  LockChange,
  LockRemoval,
  MyStatus,
  MyStatusChange,
  PresenceReport,
  Profile,
  WhiteboardRoom,
  WhiteboardSave,
  WhiteboardScene
} from "./contract.ts";

/**
 * One call to the data API, same-origin with the reader's session cookie. Null when the network
 * fails. A failed call is logged and its response returned, so callers such as analytics can stay
 * fire-and-forget. An anonymous reader never gets here: its composition root installs no data API
 * adapter at all.
 */
async function send(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<Response | null> {
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    // 401 is expected for a visitor who is not signed in, 503 on a server without the service key.
    if (!response.ok && response.status !== 401 && response.status !== 503) {
      log.warn("Data API call failed", { method, path, status: response.status });
    }
    return response;
  } catch (error) {
    log.warn("Data API unreachable", { method, path, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/** The JSON body of a successful GET, or null. */
async function getJson<T>(path: string): Promise<T | null> {
  const response = await send("GET", path);
  if (!response?.ok) return null;
  return (await response.json()) as T;
}

/** The data API, one function per route (contract.ts). */
export const dataApi = {
  recordAnalytics: (event: AnalyticsEvent) => send("POST", "/api/analytics", event),
  getMyStatus: () => getJson<MyStatus>("/api/me"),
  saveMe: (change: MyStatusChange) => send("PUT", "/api/me", change),
  changeMyStatus: (change: MyStatusChange) => send("PATCH", "/api/me", change),
  getProfile: <Visit = Record<string, unknown>>() => getJson<Profile<Visit>>("/api/profile"),
  saveProfile: <Visit>(profile: Profile<Visit>) => send("PUT", "/api/profile", profile),
  reportCourseVisit: (visit: CourseVisitReport) => send("POST", "/api/courses/visit", visit),
  reportPresence: (report: PresenceReport) => send("POST", "/api/presence", report),
  setLock: ({ courseId, loRoute, locked }: LockChange) => send("PUT", `/api/courses/${encodeURIComponent(courseId)}/locks`, { loRoute, locked }),
  removeLock: (removal: LockRemoval) => send("DELETE", "/api/locks", removal),
  getWhiteboard: (room: WhiteboardRoom) =>
    getJson<{ scene: WhiteboardScene | null }>(`/api/whiteboard?${new URLSearchParams({ courseId: room.courseId, route: room.route, shared: String(room.shared) })}`),
  saveWhiteboard: (save: WhiteboardSave) => send("PUT", "/api/whiteboard", save),
  reportLiveActivity
};

/** The reader's server route that publishes learning events to Tutors Live (apps/reader/src/routes/api/live/activity). */
export const LIVE_ACTIVITY_ROUTE = "/api/live/activity";

/**
 * POST /api/live/activity, fire-and-forget: `keepalive` lets the request finish when the student is
 * leaving the page. The browser publishes nothing over Realtime itself; the reader's server publishes
 * to Tutors Live, and only to the feeds a Live tab is watching, within the day's budget.
 */
function reportLiveActivity(activity: object): void {
  if (typeof fetch !== "function") return;
  try {
    void fetch(LIVE_ACTIVITY_ROUTE, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(activity)
    }).catch((error: unknown) => log.warn("Reporting live activity failed:", error));
  } catch (error) {
    log.warn("Reporting live activity failed:", error);
  }
}
