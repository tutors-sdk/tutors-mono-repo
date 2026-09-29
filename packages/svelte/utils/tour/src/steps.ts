import type { TourPageKind, TourStep } from "./types";

/**
 * The header's four controls. They sit above every page, so the tour opens on them wherever it is
 * started from.
 */
const headerSteps: TourStep[] = [
  { target: "[data-tour='course-title']", titleKey: "tour.courseTitle.title", descriptionKey: "tour.courseTitle.description", placement: "bottom", optional: true },
  { target: "[data-tour='search']", titleKey: "tour.search.title", descriptionKey: "tour.search.description", placement: "bottom", optional: true },
  { target: "[data-tour='layout']", titleKey: "tour.layout.title", descriptionKey: "tour.layout.description", placement: "bottom" },
  { target: "[data-tour='profile']", titleKey: "tour.profile.title", descriptionKey: "tour.profile.description", placement: "bottom" }
];

/**
 * The side menu, in the order it is read.
 *
 * Learn is covered row by row: these are the things a reader does not find on their own, and a course
 * that lacks one (no calendar, no GitHub link, no educator role) drops that row and its step together,
 * which is what `optional` is for. The sections below Learn are covered as whole groups instead - one
 * step each. Their headings say what they hold, and a step per row would put a course with companions
 * and presence past twenty steps, which is a tour nobody finishes.
 */
const sideMenuSteps: TourStep[] = [
  { target: "[data-tour='course-home']", titleKey: "tour.courseHome.title", descriptionKey: "tour.courseHome.description", placement: "right", optional: true },
  { target: "[data-tour='info']", titleKey: "tour.info.title", descriptionKey: "tour.info.description", placement: "right", optional: true },
  { target: "[data-tour='toc']", titleKey: "tour.toc.title", descriptionKey: "tour.toc.description", placement: "right", optional: true },
  { target: "[data-tour='resources']", titleKey: "tour.resources.title", descriptionKey: "tour.resources.description", placement: "right", optional: true },
  { target: "[data-tour='calendar']", titleKey: "tour.calendar.title", descriptionKey: "tour.calendar.description", placement: "right", optional: true },
  { target: "[data-tour='llm']", titleKey: "tour.llm.title", descriptionKey: "tour.llm.description", placement: "right", optional: true },
  { target: "[data-tour='edit']", titleKey: "tour.edit.title", descriptionKey: "tour.edit.description", placement: "right", optional: true },
  { target: "[data-tour='educator']", titleKey: "tour.educator.title", descriptionKey: "tour.educator.description", placement: "right", optional: true },
  { target: "[data-tour='links']", titleKey: "tour.links.title", descriptionKey: "tour.links.description", placement: "right", optional: true },
  { target: "[data-tour='tools']", titleKey: "tour.tools.title", descriptionKey: "tour.tools.description", placement: "right", optional: true },
  { target: "[data-tour='activity']", titleKey: "tour.activity.title", descriptionKey: "tour.activity.description", placement: "right", optional: true }
];

/** Header then side menu: the tour reads the page the way the page is laid out. */
const shellSteps: TourStep[] = [...headerSteps, ...sideMenuSteps];

/**
 * A course home and a topic both end on the grid of cards that is the point of the page: what a card
 * is, the badge that says which kind, and - only when the reader can see one - the lock on it.
 */
const cardSteps: TourStep[] = [
  { target: "[data-tour='card']", titleKey: "tour.card.title", descriptionKey: "tour.card.description", placement: "right", optional: true },
  { target: "[data-tour='card-type']", titleKey: "tour.cardType.title", descriptionKey: "tour.cardType.description", placement: "right", optional: true },
  { target: "[data-tour='card-lock']", titleKey: "tour.cardLock.title", descriptionKey: "tour.cardLock.description", placement: "right", optional: true }
];

/** A lab's own navigation: the list of steps the side menu puts above the Learn section. */
const labSteps: TourStep[] = [{ target: "[data-tour='lab-steps']", titleKey: "tour.labSteps.title", descriptionKey: "tour.labSteps.description", placement: "right", optional: true }];

const stepsByPage: Record<TourPageKind, TourStep[]> = {
  course: [...shellSteps, ...cardSteps],
  topic: [...shellSteps, ...cardSteps],
  lab: [...shellSteps, ...labSteps],
  other: shellSteps
};

/** The steps for one kind of page. */
export function stepsForPage(kind: TourPageKind): TourStep[] {
  return stepsByPage[kind];
}
