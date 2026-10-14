import { courseProtocol } from "../../index.svelte.ts";
import { adapters } from "../../adapters.ts";
import { decorateCourseTree as decorateDomainCourseTree, type Course, type Lo } from "@tutors/domain/course";
import type { ContentRenderer, LoadCourseDeps } from "@tutors/application";

/** The learning-object kinds whose bodies the reader renders on demand, as opening one can take a while. */
const RENDERED_ON_DEMAND = new Set(["lab", "note", "notebook", "quiz"]);

/**
 * How the reader decorates a course tree, over the domain's decoration: labs, notes, notebooks and
 * quizzes keep their markdown until opened (only their one-line summary is rendered, so a card does
 * not show "**bold**"); web links stay out of the route index; a course served over plain http has
 * its links rewritten; custom companion icons are registered with the theme.
 */
export function readerDecoration(renderer: ContentRenderer): Pick<LoadCourseDeps, "render" | "decorated" | "omitFromIndex"> {
  return {
    render: (course, lo) => {
      if (RENDERED_ON_DEMAND.has(lo.type)) {
        // A quiz is converted by its own renderer, which first splits the quiz definition out of the markdown.
        renderer.renderSummary(lo);
      } else {
        renderer.renderLo(course, lo, courseProtocol.value);
      }
    },
    decorated: registerCompanionIcons,
    omitFromIndex: (lo) => lo.type === "web"
  };
}

/** Decorate a parsed course the way the reader does, with the renderer the app composed. */
export function decorateCourseTree(course: Course, courseId: string = "", courseUrl = "", renderer?: ContentRenderer): void {
  const decoration = renderer ? readerDecoration(renderer) : { render: undefined, decorated: registerCompanionIcons, omitFromIndex: (lo: Lo) => lo.type === "web" };
  decorateDomainCourseTree(course, courseId, courseUrl, {
    render: decoration.render,
    today: adapters().clock.nowMs(),
    protocol: courseProtocol.value,
    omitFromIndex: decoration.omitFromIndex
  });
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
