import { courseProtocol } from "@tutors/runes";
import {
  decorateCourseTree as decorateCourseTreeModel,
  decorateLoTree as decorateLoTreeModel,
  injectCourseUrl as injectCourseUrlModel,
  type Course,
  type DecorateCourseOptions,
  type IconType,
  type Lo
} from "@tutors/tutors-model-lib";

/**
 * Registers a custom companion icon with the host's icon library.
 * Installed by the presentation layer (see TutorsShell) so this package
 * does not depend on a theme service.
 */
export type CompanionIconRegistrar = (key: string, icon: IconType) => void;

let companionIconRegistrar: CompanionIconRegistrar | undefined;

export function setCompanionIconRegistrar(registrar: CompanionIconRegistrar | undefined) {
  companionIconRegistrar = registrar;
}

/**
 * How the reader decorates a course, on top of the model package defaults:
 * external web links stay out of the route index, and labs, notes and
 * notebooks are converted to HTML on demand because converting every one
 * up front is slow for large courses.
 */
function readerDecorationOptions(): DecorateCourseOptions {
  return {
    excludeFromIndex: ["web"],
    deferHtmlFor: ["lab", "note", "notebook"],
    protocol: courseProtocol.value,
    onCompanionIcon: companionIconRegistrar
  };
}

export function decorateCourseTree(course: Course, courseId: string = "", courseUrl = "") {
  decorateCourseTreeModel(course, courseId, courseUrl, readerDecorationOptions());
}

export function decorateLoTree(course: Course, lo: Lo) {
  decorateLoTreeModel(course, lo, readerDecorationOptions());
}

export function injectCourseUrl(los: Lo[], id: string, url: string) {
  injectCourseUrlModel(los, id, url, courseProtocol.value);
}

/**
 * Determines the course URL and normalized course ID from various input formats.
 * Handles full URLs, Netlify domains, localhost/IP addresses, and plain course IDs.
 * @param input - Course identifier (URL, domain, or ID)
 * @returns Object with normalized courseId and courseUrl
 */
export function determineCourseUrl(input: string): { courseId: string; courseUrl: string } {
  const urlPattern = /^(https?:\/\/)?([A-Za-z0-9.-]+\.[A-Za-z]{2,})(:[0-9]+)?(\/[A-Za-z0-9_.-]+)*(\/[A-Za-z0-9_.-]+\?[A-Za-z0-9_=-]+)?(#.*)?$/;
  const isValidURL = urlPattern.test(input);

  if (isValidURL) {
    // Full URL provided (e.g., https://example.netlify.app)
    const courseUrl = input;
    const courseId = input.includes(".netlify.app") ? input.replace(".netlify.app", "") : input;
    return { courseId, courseUrl };
  }

  // Course ID only - determine protocol and construct URL
  const isLocalhost = input.startsWith("192") || input.startsWith("localhost");
  if (isLocalhost) {
    courseProtocol.value = "http://";
    return { courseId: input, courseUrl: input };
  }

  // Default to Netlify subdomain
  return { courseId: input, courseUrl: `${input}.netlify.app` };
}
