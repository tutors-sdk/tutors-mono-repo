import { adapters } from "../../adapters.ts";
import log from "@tutors/logger";
import { decorateCourseTree as decorateDomainCourseTree, type Course, type CourseFault, type Lo } from "@tutors/domain/course";
import { courseAddress, type CourseId } from "@tutors/domain/course/address";

export { courseProtocolOf, type CourseAddress } from "@tutors/domain/course/address";
import type { ContentRenderer, LoadCourseDeps } from "@tutors/application";

/** The learning-object kinds whose bodies the reader renders on demand, as opening one can take a while. */
const RENDERED_ON_DEMAND = new Set(["lab", "note", "notebook", "quiz"]);

/**
 * How the reader decorates a course tree, over the domain's decoration: labs, notes, notebooks and
 * quizzes keep their markdown until opened (only their one-line summary is rendered, so a card does
 * not show "**bold**"); web links stay out of the route index; a course served over plain http has
 * its links rewritten (the protocol comes with the course's address, not from shared state); custom companion icons are registered with the theme.
 */
export function readerDecoration(renderer: ContentRenderer, protocol = "https://"): Pick<LoadCourseDeps, "render" | "decorated" | "omitFromIndex" | "faulted"> {
  return {
    faulted: reportCourseFaults,
    render: (course, lo) => {
      if (RENDERED_ON_DEMAND.has(lo.type)) {
        // A quiz is converted by its own renderer, which first splits the quiz definition out of the markdown.
        renderer.renderSummary(lo);
      } else {
        renderer.renderLo(course, lo, protocol);
      }
    },
    decorated: registerCompanionIcons,
    omitFromIndex: (lo) => lo.type === "web"
  };
}

/** A course that loads without its calendar says why in the log; the domain only returns the fault. */
function reportCourseFaults(course: Course, faults: readonly CourseFault[]): void {
  for (const fault of faults) log.warn("Error loading calendar", { courseId: course.courseId, error: fault.message });
}

/** Decorate a parsed course the way the reader does, with the renderer the app composed. */
export function decorateCourseTree(course: Course, courseId: CourseId | "" = "", courseUrl = "", renderer?: ContentRenderer, protocol = "https://"): void {
  const decoration = renderer ? readerDecoration(renderer, protocol) : { render: undefined, decorated: registerCompanionIcons, omitFromIndex: (lo: Lo) => lo.type === "web" };
  const faults = decorateDomainCourseTree(course, courseId, courseUrl, {
    render: decoration.render,
    today: adapters().clock.nowMs(),
    protocol,
    omitFromIndex: decoration.omitFromIndex
  });
  reportCourseFaults(course, faults);
  decoration.decorated?.(course);
}

/**
 * Custom companions declared in properties.yaml are rendered by their key
 * (e.g. "piazza"), so that key must exist in the theme icon libraries - exactly
 * like the built-in companions (slack, moodle, ...) which are pre-registered in
 * fluent-icons.ts. Built-in companion keys resolve for free; custom ones do not
 * until we add them here. This lives in the state adapter (not the framework-free
 * domain) because it reaches the theme, and it runs synchronously during course
 * load so the icons are registered before the toolbar renders. The theme package
 * registers itself through {@link setCompanionIconRegistrar}; the state adapter
 * never imports the theme (adapters do not import one another).
 */
type CompanionIconRegistrar = (key: string, icon: { type: string; color: string }) => void;
let registerCompanionIcon: CompanionIconRegistrar = () => {};

/** The theme service installs its `addIcon` here when it loads. */
export function setCompanionIconRegistrar(registrar: CompanionIconRegistrar): void {
  registerCompanionIcon = registrar;
}

function registerCompanionIcons(course: Course) {
  const companions = course.properties?.companions as unknown as Record<string, { icon?: { type: string; color: string } }> | undefined;
  if (!companions) return;
  for (const [key, companion] of Object.entries(companions)) {
    if (companion?.icon?.type) {
      registerCompanionIcon(key, { type: companion.icon.type, color: companion.icon.color });
    }
  }
}

/** Resolves what a student opened a course by to where it is served: the domain's `courseAddress`, under the name the reader has always used. */
export const determineCourseUrl = courseAddress;
