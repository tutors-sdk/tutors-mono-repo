import "./svelte-runes-shim.ts";
import { vi } from "vitest";
import { decorateCourseTree, type Course, type Enrollment, type Lo, type TutorsId } from "../../../packages/jsr/model/src/tutors.ts";
import type { LoRecord } from "../../../packages/adapters/driving/svelte-state/src/community/types.svelte.ts";
import { liveService } from "../../../packages/adapters/driving/svelte-state/src/community/services/live.svelte.ts";
import { presenceService } from "../../../packages/adapters/driving/svelte-state/src/community/services/presence.svelte.ts";
import { tutorsConnectService } from "../../../packages/adapters/driving/svelte-state/src/connect/services/connect.svelte.ts";
import { configureAdapters } from "../../../packages/adapters/driving/svelte-state/src/adapters.ts";
import { recordingFunctions } from "../../../packages/adapters/driven/store-supabase/src/server/learner-store.ts";
import { composeReader } from "../../../apps/reader/src/lib/compose.ts";
import { currentCourse, currentLo, tutorsId } from "../../../packages/adapters/driving/svelte-state/src/index.svelte.ts";
import { materialiseCourse } from "../../support/arbitraries/course-tree.ts";
import { labShape, shape } from "./course.ts";
import { installReaderFetch, resetReaderApi, serveCourseJson, setReaderSession } from "./reader-api.ts";
import { browserStorage, publicEnv, recorder, settle } from "./supabase-recorder.ts";
import { POST as postLiveActivity } from "../../../apps/reader/src/routes/api/live/activity/+server.ts";

/**
 * Drives the reader's connect, analytics, presence and live services the way
 * the reader's layouts do. `freshBrowser` runs the reader's own composition root
 * (`composeReader`) against the recorder's environment, so every adapter the
 * reader composes in a signed-in deployment is in place. A steps file that
 * imports this must first mock `@supabase/supabase-js` (returning `recorder`),
 * `$app/env/public`, `$app/env` and `$app/navigation`; the identity client is
 * injected here. Every module between those seams is the real product code.
 */

export const ALL_COURSES_CHANNEL = "tutors-all-course-access";

/** What the reader's server received on POST /api/live/activity, and how it answered. */
export type LiveActivityPost = { body: unknown; status: number; answer: unknown };
export const readerServer = { posts: [] as LiveActivityPost[] };

/**
 * The browser's `fetch`, wired to the reader's server: POST /api/live/activity runs the real route
 * handler, the way SvelteKit would. Anything else is a 404, so a scenario never reaches the network.
 */
async function readerFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  const url = String(input);
  if (url !== "/api/live/activity" || init?.method !== "POST") return new Response(null, { status: 404 });
  const request = new Request(`https://reader.invalid${url}`, { method: "POST", headers: init.headers, body: init.body });
  const response = await postLiveActivity({ request } as Parameters<typeof postLiveActivity>[0]);
  const text = await response.clone().text();
  readerServer.posts.push({ body: JSON.parse(String(init.body)), status: response.status, answer: text ? JSON.parse(text) : null });
  return response;
}

/** Sends a body to the reader's server as any client could, not only the reader's own pages. */
export async function postToReaderServer(body: string): Promise<{ status: number; answer: unknown }> {
  const response = await postLiveActivity({
    request: new Request("https://reader.invalid/api/live/activity", { method: "POST", headers: { "content-type": "application/json" }, body })
  } as Parameters<typeof postLiveActivity>[0]);
  const text = await response.text();
  return { status: response.status, answer: text ? JSON.parse(text) : null };
}

/** A Tutors Live tab, in another browser, reported itself as a watcher of `topic` `secondsAgo` before now. */
export function liveWatcher(topic: string, watcher: string, secondsAgo = 0): void {
  recorder.rows("realtime_watchers").push({ topic, watcher, seen_at: new Date(Date.now() - secondsAgo * 1000).toISOString() });
}

/** A browser tab with nobody signed in, no course open and nobody online. */
export function freshBrowser(): void {
  vi.clearAllMocks();
  liveService.stopGlobalPresenceService();
  liveService.stopCoursePresenceListener();
  presenceService.stopPresenceListener();
  recorder.reset();
  resetReaderApi();
  recordingFunctions.missing = false;
  const storage = browserStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("document", { hidden: false });
  vi.stubGlobal("fetch", readerFetch);
  installReaderFetch();
  readerServer.posts = [];

  tutorsId.value = null;
  currentCourse.value = null;
  currentLo.value = null;
  // The reader's composition root, with the signed-in environment the recorder describes and the
  // identity adapter stubbed: the Supabase adapters it composes all talk to the recorder.
  const identityClient = { signIn: vi.fn(), signOut: vi.fn() };
  configureAdapters(composeReader(publicEnv, { identityClient }));
  tutorsConnectService.identityClient = identityClient;
  Object.assign(tutorsConnectService, { lastLearningEvent: "", pendingNavigation: true, navigationInFlight: true, navigationAttempt: 0 });

  Object.assign(presenceService, { listening: false, listeningTo: "" });
  presenceService.studentsOnline.value = [];
  presenceService.studentEventMap.clear();

  Object.assign(liveService, { listeningAll: false });
  liveService.listeningForCourse.value = "";
  liveService.coursesOnline.value = [];
  liveService.studentsOnline.value = [];
  liveService.studentEventMap.clear();
  liveService.courseEventMap.clear();
}

/** The identity the identity adapter hands the reader for a GitHub user. */
export function githubUser(name: string): TutorsId {
  const login = name.toLowerCase();
  return { name, login, email: `${login}@example.com`, image: `https://avatars.example/${login}.png`, share: "true", sentiment: "neutral" };
}

/**
 * A published course with one topic of `labCount` labs, loaded as the reader loads it.
 * `properties` are the course's properties.yaml; `enrollment` is its enrollment.yaml, as the generator emits it.
 */
export function publishedCourse(courseId: string, labCount = 2, properties: Record<string, unknown> = {}, enrollment?: Enrollment): Course {
  const labs = Array.from({ length: labCount }, (_, l) => labShape(`Lab ${l + 1}`, [{ title: "Setup", contentMd: "# Setup" }]));
  const title = `Course ${courseId}`;
  const raw = materialiseCourse({ title, summary: `${title} summary`, contentMd: `# ${title}`, children: [shape("topic", "Topic 1", labs)] });
  Object.assign(raw.properties, properties);
  const course = structuredClone(raw) as unknown as Course;
  if (enrollment) course.enrollment = enrollment;
  serveCourseJson(courseId, enrollment ? { ...raw, enrollment } : raw);
  decorateCourseTree(course, courseId, `${courseId}.netlify.app`);
  return course;
}

export function labsOf(course: Course): Lo[] {
  return [...new Set(course.loIndex.values())].filter((lo) => lo.type === "lab");
}

/** What the reader's root layout does once the identity adapter reports a session. */
export async function signIn(user: TutorsId): Promise<void> {
  setReaderSession(user);
  await tutorsConnectService.reconnect(user);
  await settle();
}

/** What the course layout does when a page of `course` showing `lo` is opened. */
export async function openLo(course: Course, lo: Lo): Promise<void> {
  const arriving = currentCourse.value?.courseId !== course.courseId;
  currentCourse.value = course;
  currentLo.value = lo;
  if (arriving) {
    tutorsConnectService.checkWhiteList();
    tutorsConnectService.courseVisit(course);
  }
  // Opening a page is a navigation, which is what the layout reports on; calling `learningEvent`
  // again without this is the layout's effect re-running, not the student going anywhere.
  tutorsConnectService.navigated();
  tutorsConnectService.learningEvent({});
  await settle();
}

/** A different student, in their own browser, signs in and opens a lab of `course`. */
export async function studentOpensLab(name: string, course: Course, lab = 0): Promise<void> {
  tutorsId.value = null;
  setReaderSession(null);
  currentCourse.value = null;
  await signIn(githubUser(name));
  await openLo(course, labsOf(course)[lab]);
}

/**
 * A lo-event arriving over realtime from another student's browser, in the wire
 * format `presenceService.sendLoEvent` broadcasts. Only the listeners under test
 * are product code here; the sender is the network.
 */
export function loEventArrives(channel: string, name: string, course: Course, lo: Lo): void {
  const user = githubUser(name);
  recorder.relay(channel, {
    type: "broadcast",
    event: "lo-event",
    payload: {
      courseId: course.courseId,
      courseUrl: course.courseUrl,
      courseTitle: course.title,
      img: lo.img,
      title: lo.title,
      loRoute: lo.route,
      type: lo.type,
      isPrivate: false,
      user: { fullName: user.name, avatar: user.image, id: user.login, sentiment: user.sentiment }
    }
  });
}

/**
 * Another student's latest activity as the database holds it: the row `sendLoEvent` upserts into
 * `tutors-connect-latest` from their browser, stamped `minutesAgo` before the reader's clock.
 */
export function storedActivity(name: string, course: Course, lo: Lo, minutesAgo: number): void {
  const user = githubUser(name);
  const row = {
    course_id: course.courseId,
    student_id: user.login,
    payload: {
      courseId: course.courseId,
      courseUrl: course.courseUrl,
      courseTitle: course.title,
      img: lo.img,
      title: lo.title,
      loRoute: lo.route,
      type: lo.type,
      isPrivate: false,
      user: { fullName: user.name, avatar: user.image, id: user.login, sentiment: user.sentiment }
    },
    received_at: new Date(Date.now() - minutesAgo * 60_000).toISOString()
  };
  const rows = recorder.rows("tutors-connect-latest");
  const at = rows.findIndex((existing) => existing.course_id === row.course_id && existing.student_id === row.student_id);
  if (at >= 0) rows[at] = row;
  else rows.push(row);
}

/** The learning events the reader stored for Tutors Live for `name`, in order: its upserts into tutors-connect-latest. */
export function liveActivityStored(name: string): LoRecord[] {
  return recorder
    .upserts("tutors-connect-latest")
    .map((row) => row.payload as LoRecord)
    .filter((payload) => payload.user?.fullName === name);
}

/** How many times the reader asked the database for a course's online list. */
export function onlineListLoads(): number {
  return recorder.tableCalls.filter((call) => call.table === "tutors-connect-latest" && call.op === "select").length;
}
