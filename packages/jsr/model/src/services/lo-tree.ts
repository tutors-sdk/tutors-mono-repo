import { isCompositeLo } from "../types/type-utils.ts";
import type { Composite, Course, IconType, Lo, Topic } from "../types/index.ts";
import { allVideoLos, crumbs, filterByType, flattenLos, getPanels, getUnits, injectCourseUrl, loadIcon, removeUnknownLos } from "../utils/lo-utils.ts";
import { createCompanions, createWalls, initCalendar, loadPropertyFlags } from "../utils/course-utils.ts";
import { convertLoToHtml } from "../utils/markdown-utils.ts";

/**
 * Host-specific choices for decorating a course tree.
 *
 * The generator CLI decorates with the defaults (everything indexed, all
 * markdown converted up front). The reader passes options so the same
 * decoration code serves both without a forked copy.
 */
export interface DecorateCourseOptions {
  /** Lo types left out of `loIndex` (the reader omits external "web" links). */
  excludeFromIndex?: string[];
  /** Lo types whose markdown is converted lazily by the host instead of during decoration. */
  deferHtmlFor?: string[];
  /** Protocol forced onto routes and asset URLs; "http://" downgrades https links for local course servers. */
  protocol?: string;
  /**
   * Called for every custom companion in properties.yaml that declares an icon,
   * so the host can register it with its icon library before the toolbar renders.
   */
  onCompanionIcon?: (key: string, icon: IconType) => void;
}

export function decorateCourseTree(
  course: Course,
  courseId: string = "",
  courseUrl = "",
  options: DecorateCourseOptions = {},
) {
  // define course properties
  course.courseId = courseId;
  course.courseUrl = courseUrl;
  course.route = `/course/${courseId}`;

  // retrieve all Los in course
  let allLos = flattenLos(course.los);
  allLos.push(course);

  // inject course path into all routes
  injectCourseUrl(allLos, courseId, courseUrl, options.protocol);

  const excluded = options.excludeFromIndex;
  if (excluded?.length) {
    allLos = allLos.filter((lo) => !excluded.includes(lo.type));
  }

  removeUnknownLos(course.los);
  // Construct course tree
  decorateLoTree(course, course, options);

  // index all Los in course
  course.loIndex = new Map<string, Lo>();
  allLos.forEach((lo) => course.loIndex.set(lo.route, lo));
  const videoLos = allVideoLos(allLos);
  videoLos.forEach((lo) => course.loIndex.set(lo.video, lo));
  course.topicIndex = new Map<string, Topic>();
  const topicLos = filterByType(allLos, "topic");
  topicLos.forEach((lo) => course.topicIndex.set(lo.route, lo as Topic));

  loadPropertyFlags(course);
  createCompanions(course);
  if (options.onCompanionIcon) {
    registerCompanionIcons(course, options.onCompanionIcon);
  }
  createWalls(course);
  initCalendar(course);
}

/**
 * Custom companions declared in properties.yaml are rendered by their key
 * (e.g. "piazza"), so that key must exist in the host's icon library exactly
 * like the built-in companions (slack, moodle, ...). Built-in keys resolve for
 * free; custom ones are handed to the host here.
 */
function registerCompanionIcons(course: Course, register: (key: string, icon: IconType) => void) {
  const companions = course.properties?.companions as unknown as Record<string, { icon?: IconType }> | undefined;
  if (!companions) return;
  for (const [key, companion] of Object.entries(companions)) {
    if (companion?.icon?.type) {
      register(key, { type: companion.icon.type, color: companion.icon.color });
    }
  }
}

export function decorateLoTree(course: Course, lo: Lo, options: DecorateCourseOptions = {}) {
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
      lo.breadCrumbs[1].route = lo.breadCrumbs[1].route.replace(
        "topic",
        "course",
      );
    }
  }

  // Convert contentMd to html, unless the host converts this type on demand
  if (!options.deferHtmlFor?.includes(lo.type)) {
    convertLoToHtml(course, lo);
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
      ...compositeLo?.units?.sides,
    );

    for (const childLo of compositeLo.los) {
      childLo.parentLo = lo;
      if (compositeLo.los) {
        decorateLoTree(course, childLo, options);
      }
    }
  }
}
