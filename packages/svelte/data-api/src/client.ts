import { env } from "$env/dynamic/public";
import log from "@tutors/logger";
import type {
  AnalyticsEvent,
  Bookmark,
  BookmarkChange,
  CourseVisitReport,
  Home,
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
 * One call to the data API, same-origin with the reader's session cookie. Null without calling
 * anything in anonymous mode, or when the network fails. A failed call is logged and its response
 * returned, so callers such as analytics can stay fire-and-forget.
 */
async function send(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<Response | null> {
  if (env.PUBLIC_ANON_MODE === "TRUE") return null;
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
  getHome: () => getJson<Home>("/api/home"),
  getBookmarks: () => getJson<{ bookmarks: Bookmark[] }>("/api/bookmarks"),
  addBookmark: (change: BookmarkChange) => send("PUT", "/api/bookmarks", change),
  removeBookmark: (change: BookmarkChange) => send("DELETE", "/api/bookmarks", change),
  reportCourseVisit: (visit: CourseVisitReport) => send("POST", "/api/courses/visit", visit),
  reportPresence: (report: PresenceReport) => send("POST", "/api/presence", report),
  setLock: (change: LockChange) => send("PUT", "/api/locks", change),
  removeLock: (removal: LockRemoval) => send("DELETE", "/api/locks", removal),
  getWhiteboard: (room: WhiteboardRoom) =>
    getJson<{ scene: WhiteboardScene | null }>(`/api/whiteboard?${new URLSearchParams({ courseId: room.courseId, route: room.route, shared: String(room.shared) })}`),
  saveWhiteboard: (save: WhiteboardSave) => send("PUT", "/api/whiteboard", save)
};
