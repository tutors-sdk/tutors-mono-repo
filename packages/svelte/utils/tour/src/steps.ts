import type { MessageKey } from "@tutors/i18n";
import type { TourStep } from "./types";

/**
 * The tour walks the reader the way the page is drawn: the header from left to right, then the sidebar
 * from top to bottom, then the cards on the canvas (#371). Every step is filtered against the DOM when
 * the tour starts, so a step whose control this reader or this course has not got is simply never shown.
 */

/** The header, in the order the eye crosses it. */
export const courseHeaderSteps: TourStep[] = [
  { target: "[data-tour='course-title']", titleKey: "tour.courseTitle.title", descriptionKey: "tour.courseTitle.description", placement: "bottom" },
  { target: "[data-tour='search']", titleKey: "tour.search.title", descriptionKey: "tour.search.description", placement: "bottom" },
  { target: "[data-tour='layout']", titleKey: "tour.layout.title", descriptionKey: "tour.layout.description", placement: "bottom" },
  { target: "[data-tour='profile']", titleKey: "tour.profile.title", descriptionKey: "tour.profile.description", placement: "bottom" }
];

/** The sidebar, top to bottom: Learn, then Course tools, then Activity, then Companions (Rule 0235). */
export const courseSidebarSteps: TourStep[] = [
  { target: "[data-tour='overview']", titleKey: "tour.overview.title", descriptionKey: "tour.overview.description", placement: "right" },
  { target: "[data-tour='info']", titleKey: "tour.info.title", descriptionKey: "tour.info.description", placement: "right" },
  { target: "[data-tour='toc']", titleKey: "tour.toc.title", descriptionKey: "tour.toc.description", placement: "right" },
  { target: "[data-tour='resources']", titleKey: "tour.resources.title", descriptionKey: "tour.resources.description", placement: "right" },
  { target: "[data-tour='calendar']", titleKey: "tour.calendar.title", descriptionKey: "tour.calendar.description", placement: "right" },
  { target: "[data-tour='llm']", titleKey: "tour.llm.title", descriptionKey: "tour.llm.description", placement: "right" },
  { target: "[data-tour='edit-course']", titleKey: "tour.editCourse.title", descriptionKey: "tour.editCourse.description", placement: "right" },
  { target: "[data-tour='educator-control']", titleKey: "tour.educatorControl.title", descriptionKey: "tour.educatorControl.description", placement: "right" },
  { target: "[data-tour='whiteboard']", titleKey: "tour.whiteboard.title", descriptionKey: "tour.whiteboard.description", placement: "right" },
  { target: "[data-tour='my-time']", titleKey: "tour.myTime.title", descriptionKey: "tour.myTime.description", placement: "right" },
  { target: "[data-tour='class-activity']", titleKey: "tour.classActivity.title", descriptionKey: "tour.classActivity.description", placement: "right" },
  { target: "[data-tour='live-now']", titleKey: "tour.liveNow.title", descriptionKey: "tour.liveNow.description", placement: "right" },
  { target: "[data-tour='online']", titleKey: "tour.online.title", descriptionKey: "tour.online.description", placement: "right" },
  { target: "[data-tour='companions']", titleKey: "tour.companions.title", descriptionKey: "tour.companions.description", placement: "right" }
];

/** Off a course there is no course to explain, so the home tour crosses the header and then the sidebar. */
export const homeSteps: TourStep[] = [
  { target: "[data-tour='brand']", titleKey: "tour.brand.title", descriptionKey: "tour.brand.description", placement: "bottom" },
  { target: "[data-tour='layout']", titleKey: "tour.layout.title", descriptionKey: "tour.layout.description", placement: "bottom" },
  { target: "[data-tour='profile']", titleKey: "tour.profile.title", descriptionKey: "tour.profile.description", placement: "bottom" },
  { target: "[data-tour='my-courses']", titleKey: "tour.myCourses.title", descriptionKey: "tour.myCourses.description", placement: "right" },
  { target: "[data-tour='catalogue']", titleKey: "tour.catalogue.title", descriptionKey: "tour.catalogue.description", placement: "right" },
  { target: "[data-tour='live']", titleKey: "tour.live.title", descriptionKey: "tour.live.description", placement: "right" },
  { target: "[data-tour='time']", titleKey: "tour.time.title", descriptionKey: "tour.time.description", placement: "right" },
  { target: "[data-tour='create']", titleKey: "tour.create.title", descriptionKey: "tour.create.description", placement: "right" },
  { target: "[data-tour='docs']", titleKey: "tour.docs.title", descriptionKey: "tour.docs.description", placement: "right" },
  { target: "[data-tour='course-list']", titleKey: "tour.courseList.title", descriptionKey: "tour.courseList.description", placement: "top" },
  { target: "[data-tour='course-card']", titleKey: "tour.courseCard.title", descriptionKey: "tour.courseCard.description", placement: "right" }
];

/** A panel variant is the same kind of resource as its base, so it borrows the base's words. */
const cardTypeAliases: Record<string, string> = { paneltalk: "talk", panelnote: "note", panelvideo: "video", reference: "web" };

/** The types the tour can speak about by name. Anything else gets the generic card step. */
const describedCardTypes = ["course", "topic", "unit", "side", "lab", "note", "talk", "video", "web", "github", "archive", "notebook", "quiz", "podcast", "book", "tutorial"];

/** The step that explains one kind of card, pointed at the first card of that kind on the canvas. */
export function cardStepForType(type: string): TourStep {
  const base = cardTypeAliases[type] ?? type;
  const named = describedCardTypes.includes(base);
  return {
    target: `.resource-card[data-lo-type='${type}']`,
    titleKey: (named ? `tour.card.${base}.title` : "tour.card.generic.title") as MessageKey,
    descriptionKey: (named ? `tour.card.${base}.description` : "tour.card.generic.description") as MessageKey,
    placement: "right"
  };
}

/** Kept for callers that want the menus alone; the service appends the canvas's cards to it. */
export const courseReaderSteps: TourStep[] = [...courseHeaderSteps, ...courseSidebarSteps];
