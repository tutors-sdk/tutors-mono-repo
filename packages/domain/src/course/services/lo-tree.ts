import { isCompositeLo } from "../types/type-utils.ts";
import type { Composite, Course, Lo, Topic } from "../types/index.ts";
import { allVideoLos, crumbs, filterByType, flattenLos, getPanels, getUnits, injectCourseUrl, loadIcon, removeUnknownLos } from "../utils/lo-utils.ts";
import { createCompanions, createWalls, initCalendar, loadPropertyFlags } from "../utils/course-utils.ts";

/**
 * What decorating a course tree needs from outside the domain.
 *
 * Markdown rendering is an adapter (the ContentRenderer port), so the tree takes a `render`
 * callback and applies it to every learning object; with none, bodies stay as markdown. The
 * current calendar week is read against `today` (epoch milliseconds), the Clock port's value,
 * so a frozen harness clock freezes it too.
 */
export type DecorateOptions = {
  render?: (course: Course, lo: Lo) => void;
  today?: number;
  /** "http://" rewrites the https links of a course served locally (the reader's courseProtocol). */
  protocol?: string;
  /** Learning objects left out of the route index; the reader leaves out web links. */
  omitFromIndex?: (lo: Lo) => boolean;
};

export function decorateCourseTree(
  course: Course,
  courseId: string = "",
  courseUrl = "",
  options: DecorateOptions = {},
) {
  // define course properties
  course.courseId = courseId;
  course.courseUrl = courseUrl;
  course.route = `/course/${courseId}`;

  // retrieve all Los in course
  let allLos = flattenLos(course.los);
  allLos.push(course);

  // inject course path into all routes
  injectCourseUrl(allLos, courseId, courseUrl);
  if (options.protocol === "http://") allLos.forEach(localizePath);
  if (options.omitFromIndex) allLos = allLos.filter((lo) => !options.omitFromIndex!(lo));

  removeUnknownLos(course.los);
  // Construct course tree
  decorateLoTree(course, course, options.render);

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
  createWalls(course);
  // createToc(course);
  initCalendar(course, options.today);
}

/** A course served over plain http (localhost, a LAN address) has its generated https links rewritten. */
function localizePath(lo: Lo) {
  lo.route = lo.route?.replace("https://", "http://");
  lo.video = lo.video?.replace("https://", "http://");
  lo.img = lo.img?.replace("https://", "http://");
  const withFiles = lo as Lo & { pdf?: string; excalidraw?: string };
  if (withFiles.pdf) {
    withFiles.pdf = withFiles.pdf.replace("https://", "http://");
  }
  if (withFiles.excalidraw) {
    withFiles.excalidraw = withFiles.excalidraw.replace("https://", "http://");
  }
}

export function decorateLoTree(course: Course, lo: Lo, render?: (course: Course, lo: Lo) => void) {
  // every Lo knows its parent
  lo.parentCourse = course;
  // recover icon from frontmatter if present
  lo.icon = loadIcon(lo);
  // define breadcrump - path to all parent Los
  lo.breadCrumbs = [];
  crumbs(lo, lo.breadCrumbs);
  if (lo.breadCrumbs?.length > 2) {
    if (
      lo.breadCrumbs[1].type === "unit" ||
      lo.breadCrumbs[1].type === "side"
    ) {
      // The generator routes a top-level unit or side to its parent page as
      // /topic/<course id>, which is really the course page. Rewrite only that
      // leading segment: this runs once per descendant, and a course id such as
      // "web-topics-2026" must come through intact.
      lo.breadCrumbs[1].route = lo.breadCrumbs[1].route.replace(
        /^\/topic(?=\/|$)/,
        "/course",
      );
    }
  }

  // Convert contentMd to html, when a renderer was supplied
  render?.(course, lo);

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
      ...compositeLo?.units?.sides,
    );

    for (const childLo of compositeLo.los) {
      childLo.parentLo = lo;
      if (compositeLo.los) {
        decorateLoTree(course, childLo, render);
      }
    }
  }
}