import { nowMs } from "@tutors/runtime";
import { themeService } from "@tutors/themes";
import {
  allVideoLos,
  convertLoSummaryToHtml,
  convertLoToHtml,
  createCompanions,
  createWalls,
  crumbs,
  filterByType,
  fixRoutePaths,
  flattenLos,
  getPanels,
  getUnits,
  initCalendar,
  isCompositeLo,
  loadIcon,
  loadPropertyFlags,
  removeUnknownLos,
  type Archive,
  type Composite,
  type Course,
  type Lab,
  type Lo,
  type Talk,
  type Topic,
  type Tutorial,
  type Whiteboard
} from "@tutors/tutors-model-lib";

/** The protocol each decorated course is served on, kept with the course rather than in shared state. */
const courseProtocols = new WeakMap<Course, string>();

/** The protocol `course` is served on, as resolved when it was loaded ("https://" when it was not). */
export function courseProtocolOf(course: Course): string {
  return courseProtocols.get(course) ?? "https://";
}

export function decorateCourseTree(course: Course, courseId: string = "", courseUrl = "", protocol = "https://") {
  // define course properties
  course.courseId = courseId;
  course.courseUrl = courseUrl;
  course.route = `/course/${courseId}`;
  courseProtocols.set(course, protocol);

  // retrieve all Los in course
  let allLos = flattenLos(course.los);
  allLos.push(course);
  // inject course path into all routes
  injectCourseUrl(allLos, courseId, courseUrl, protocol);
  // remove all los with type = "web"
  allLos = allLos.filter((lo) => lo.type !== "web");

  removeUnknownLos(course.los);
  // Construct course tree
  decorateLoTree(course, course);

  // index all Los in course
  course.loIndex = new Map<string, Lo>();
  allLos.forEach((lo) => course.loIndex.set(lo.route, lo));
  const videoLos = allVideoLos(allLos);
  videoLos.forEach((lo) => course.loIndex.set(lo.video, lo));
  course.topicIndex = new Map<string, Topic>();
  //course.los.forEach((lo) => course.topicIndex.set(lo.route, lo as Topic));
  const topicLos = filterByType(allLos, "topic");
  topicLos.forEach((lo) => course.topicIndex.set(lo.route, lo as Topic));

  loadPropertyFlags(course);
  createCompanions(course);
  registerCompanionIcons(course);
  createWalls(course);
  // createToc(course);
  // The current week follows the server clock seam, so a frozen HARNESS_NOW freezes it too.
  initCalendar(course, nowMs());
}

/**
 * Custom companions declared in properties.yaml are rendered by their key
 * (e.g. "piazza"), so that key must exist in the theme icon libraries - exactly
 * like the built-in companions (slack, moodle, ...) which are pre-registered in
 * fluent-icons.ts. Built-in companion keys resolve for free; custom ones do not
 * until we add them here. This lives in the Svelte layer (not the framework-free
 * model package) because it depends on themeService, and it runs synchronously
 * during course load so the icons are registered before the toolbar renders.
 */
function registerCompanionIcons(course: Course) {
  const companions = course.properties?.companions as unknown as Record<string, { icon?: { type: string; color: string } }> | undefined;
  if (!companions) return;
  for (const [key, companion] of Object.entries(companions)) {
    if (companion?.icon?.type) {
      themeService.addIcon(key, { type: companion.icon.type, color: companion.icon.color });
    }
  }
}

function decorateLoTree(course: Course, lo: Lo) {
  // every Lo knows its parent
  lo.parentCourse = course;
  // recover icon from frontmatter if present
  lo.icon = loadIcon(lo);
  // define breadcrump - path to all parent Los
  lo.breadCrumbs = [];
  crumbs(lo, lo.breadCrumbs);
  if (lo.breadCrumbs?.length > 2) {
    if (lo.breadCrumbs[1].type === "unit" || lo.breadCrumbs[1].type === "side") {
      // The generator routes a top-level unit or side to its parent page as /topic/<course id>,
      // which is really the course page. Rewrite only that leading segment: this runs once per
      // descendant, and a course id such as "web-topics-2026" must come through intact.
      lo.breadCrumbs[1].route = lo.breadCrumbs[1].route.replace(/^\/topic(?=\/|$)/, "/course");
    }
  }

  // Convert contentMd to html
  if (lo.type !== "lab" && lo.type !== "note" && lo.type !== "notebook" && lo.type !== "quiz") {
    // Convert labs, notes, notebooks & quizzes on demand as can be time consuming to convert all at once.
    // A quiz is converted by its own renderer, which first splits the quiz definition out of the markdown.
    convertLoToHtml(course, lo);
  } else {
    // Only the body of those types waits for on demand conversion. The summary is a single
    // line and its card is on screen as soon as the tree is built, so leaving it as markdown
    // renders the source - "**bold**" and all - until the Lo itself is opened.
    convertLoSummaryToHtml(lo);
  }

  if (isCompositeLo(lo)) {
    // if Lo is composite, recursively decorate all child los
    const compositeLo = lo as Composite;
    compositeLo.panels = getPanels(compositeLo.los);
    compositeLo.units = getUnits(compositeLo.los);

    compositeLo.toc = [];
    compositeLo.toc.push(
      // eslint-disable-next-line no-unsafe-optional-chaining
      ...compositeLo?.panels?.panelVideos,
      // eslint-disable-next-line no-unsafe-optional-chaining
      ...compositeLo?.panels?.panelTalks,
      // eslint-disable-next-line no-unsafe-optional-chaining
      ...compositeLo?.panels?.panelNotes,
      // eslint-disable-next-line no-unsafe-optional-chaining
      ...compositeLo?.units?.units,
      // eslint-disable-next-line no-unsafe-optional-chaining
      ...compositeLo?.units?.standardLos,
      // eslint-disable-next-line no-unsafe-optional-chaining
      ...compositeLo?.units?.sides
    );

    for (const childLo of compositeLo.los) {
      childLo.parentLo = lo;
      if (compositeLo.los) {
        decorateLoTree(course, childLo);
      }
    }
  }
}

function injectCourseUrl(los: Lo[], id: string, url: string, protocol = "https://") {
  los.forEach((lo) => {
    if (lo.type === "archive") {
      const archive: Archive = lo as Archive;
      archive.route = `https://${lo.route?.replace("/archive/{{COURSEURL}}", url)}/${archive.archiveFile}`;
    } else {
      lo.route = lo.route?.replace("{{COURSEURL}}", id);
    }

    lo.img = lo.img?.replace("{{COURSEURL}}", url);
    lo.video = lo.video?.replace("{{COURSEURL}}", id);
    if (lo.type == "talk" || lo.type == "paneltalk") {
      const talk = lo as Talk;
      talk.pdf = talk.pdf?.replace("{{COURSEURL}}", url);
    }
    if (lo.type === "tutorial") {
      const tutorial = lo as Tutorial;
      if (tutorial.pdf) {
        tutorial.pdf = tutorial.pdf?.replace("{{COURSEURL}}", url);
      }
    }
    if (lo.type == "lab") {
      const lab = lo as Lab;
      lab.pdf = lab.pdf?.replace("{{COURSEURL}}", url);
    }
    if (lo.type === "whiteboard") {
      const whiteboard = lo as Whiteboard;
      whiteboard.excalidraw = whiteboard.excalidraw?.replace("{{COURSEURL}}", url);
    }

    localizePath(lo, protocol);
    fixRoutePaths(lo);
  });
}

function localizePath(lo: Lo, protocol: string) {
  if (protocol === "http://") {
    lo.route = lo.route?.replace("https://", "http://");
    lo.video = lo.video?.replace("https://", "http://");
    lo.img = lo.img?.replace("https://", "http://");
    if ((lo as any).pdf) {
      (lo as any).pdf = (lo as any).pdf?.replace("https://", "http://");
    }
    if ((lo as any).excalidraw) {
      (lo as any).excalidraw = (lo as any).excalidraw?.replace("https://", "http://");
    }
  }
}

/** Where a course is served: `courseUrl` has no scheme, `protocol` is the scheme to fetch and link it with. */
export interface CourseAddress {
  courseId: string;
  courseUrl: string;
  protocol: "https://" | "http://";
}

const LOCAL_HOST = /^(localhost|\d{1,3}(\.\d{1,3}){3})$/;

/**
 * Resolves what a student opened a course by (a bare Netlify id, a host name with an optional port
 * and path, or a full http(s) URL) to the one place it is served and the one id it is cached under.
 * A bare id is `<id>.netlify.app`; localhost and IPv4 addresses default to http, anything else to
 * https. An explicit scheme is kept. A Netlify site keeps its bare id, so analytics, locks and
 * enrollment keys are the same whichever form was used. Trailing slashes, the query and the fragment
 * are dropped: tutors.json sits at the course root.
 * @param input - Course identifier (URL, domain, or ID)
 * @returns The normalized courseId, the scheme-less courseUrl and the protocol it is served on
 * @throws Error for a scheme other than http or https, credentials in the URL, or input that is not a URL
 */
export function determineCourseUrl(input: string): CourseAddress {
  const address = input.trim();
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(address)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") {
    throw new Error(`Unsupported course URL scheme "${scheme}:" in "${input}"`);
  }
  const isBareId = !scheme && /^[^./:?#]+$/.test(address) && address !== "localhost";
  const target = isBareId ? `${address}.netlify.app` : address;

  let url: URL;
  try {
    url = new URL(scheme ? target : `https://${target}`);
  } catch {
    throw new Error(`Malformed course URL "${input}"`);
  }
  if (!url.hostname || url.username || url.password) {
    throw new Error(`Malformed course URL "${input}"`);
  }

  const protocol = scheme ? (`${scheme}://` as CourseAddress["protocol"]) : LOCAL_HOST.test(url.hostname) ? "http://" : "https://";
  let path = url.pathname;
  // A loop, not /\/+$/: that regex backtracks polynomially on input with many slashes (CodeQL js/polynomial-redos).
  while (path.endsWith("/")) path = path.slice(0, -1);
  const courseUrl = `${url.host}${path}`;

  if (isBareId) return { courseId: address, courseUrl, protocol };
  const courseId = url.hostname.endsWith(".netlify.app") ? courseUrl.replace(".netlify.app", "") : courseUrl;
  return { courseId, courseUrl, protocol };
}
