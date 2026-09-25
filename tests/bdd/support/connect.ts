import "./svelte-runes-shim.ts";
import { vi } from "vitest";
import { decorateCourseTree, type Course, type Enrollment, type Lo, type TutorsId } from "../../../packages/jsr/model/src/tutors.ts";
import { liveService } from "../../../packages/svelte/community/src/services/live.svelte.ts";
import { presenceService } from "../../../packages/svelte/community/src/services/presence.svelte.ts";
import { tutorsConnectService } from "../../../packages/svelte/connect/src/services/connect.svelte.ts";
import { localStorageProfile } from "../../../packages/svelte/connect/src/services/localStorageProfile.ts";
import { supabaseProfile } from "../../../packages/svelte/connect/src/services/supabaseProfile.svelte.ts";
import { currentCourse, currentLo, tutorsId } from "../../../packages/svelte/runes/src/index.svelte.ts";
import { materialiseCourse } from "../../support/arbitraries/course-tree.ts";
import { labShape, shape } from "./course.ts";
import { installReaderFetch, resetReaderApi, serveCourseJson, setReaderSession } from "./reader-api.ts";
import { browserStorage, recorder, settle } from "./supabase-recorder.ts";


export const ALL_COURSES_CHANNEL = "tutors-all-course-access";

/** A browser tab with nobody signed in, no course open and nobody online. */
export function freshBrowser(): void {
  vi.clearAllMocks();
  recorder.reset();
  resetReaderApi();
  installReaderFetch();
  const storage = browserStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("document", { hidden: false });

  tutorsId.value = null;
  currentCourse.value = null;
  currentLo.value = null;
  tutorsConnectService.profile = localStorageProfile;
  localStorageProfile.courseVisits = [];
  supabaseProfile.courseVisits = [];

  Object.assign(presenceService, { channelAll: null, channelCourse: null, listeningTo: "" });
  presenceService.studentsOnline.value = [];
  presenceService.studentEventMap.clear();

  Object.assign(liveService, { channelCourse: null, listeningAll: false });
  liveService.listeningForCourse.value = "";
  liveService.coursesOnline.value = [];
  liveService.studentsOnline.value = [];
  liveService.studentEventMap.clear();
  liveService.courseEventMap.clear();
}

/** The identity Auth.js hands the reader for a GitHub user. */
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

/** What the reader's root layout does once Auth.js reports a session. */
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
