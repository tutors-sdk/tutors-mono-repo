import { rune, currentCourse } from "@tutors/runes";
import type { TourStep } from "./types";
import { cardStepForType, courseHeaderSteps, courseSidebarSteps, homeSteps, openMenuStep } from "./steps";
import { browser } from "$app/environment";

const TOUR_COMPLETED_KEY = "tutors-tour-completed";

export function findTourTarget(selector: string): Element | undefined {
  if (!browser) return;
  return Array.from(document.querySelectorAll(selector)).find(el => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility === "visible";
  });
}

/**
 * One step per kind of card on the canvas, in the order the kinds first appear. Which kinds those are
 * is the author's doing and changes from page to page, so the steps are read off the DOM rather than
 * listed: a topic page of labs and notes gets two card steps, a mixed one gets as many as it shows.
 */
function cardSteps(): TourStep[] {
  if (!browser) return [];
  const types: string[] = [];
  for (const card of document.querySelectorAll<HTMLElement>(".resource-card[data-lo-type]")) {
    const type = card.dataset.loType;
    if (type && !types.includes(type)) types.push(type);
  }
  return types.map(cardStepForType);
}

/** The whole tour for whatever the reader is looking at: a course's menus and cards, or the home page. */
export function buildTourSteps(): TourStep[] {
  if (!currentCourse.value) return homeSteps;
  const mobile = !!findTourTarget(openMenuStep.target);
  const tree = courseSidebarSteps.find(step => step.target === "[data-tour='toc']")!;
  // On phones the tree is in the header, outside the navigation drawer.
  const header = mobile ? [courseHeaderSteps[0], tree, ...courseHeaderSteps.slice(1)] : courseHeaderSteps;
  const sidebar = mobile ? courseSidebarSteps.filter(step => step !== tree) : courseSidebarSteps;
  return [...header, openMenuStep, ...sidebar, ...cardSteps()];
}

function createTourService() {
  const isOpen = rune(false);
  const currentStepIndex = rune(0);
  const activeSteps = rune<TourStep[]>([]);
  const navigationOpen = rune(false);
  let navigationWasOpen = false;

  function start(steps: TourStep[] = buildTourSteps()) {
    if (!browser) return;
    const mobile = steps.some(step => step.target === openMenuStep.target) && !!findTourTarget(openMenuStep.target);
    // The desktop copy tells us which menu controls this reader has; the mobile copy mounts on open.
    const visible = steps.filter(step => findTourTarget(step.target) || (mobile && document.querySelector(`.shell-navigation ${step.target}`)));
    if (visible.length === 0) return;
    activeSteps.value = visible;
    navigationWasOpen = navigationOpen.value;
    currentStepIndex.value = 0;
    isOpen.value = true;
  }

  function next() {
    if (activeSteps.value[currentStepIndex.value]?.target === openMenuStep.target && !navigationOpen.value) return;
    if (currentStepIndex.value < activeSteps.value.length - 1) {
      moveTo(currentStepIndex.value + 1);
    } else {
      complete();
    }
  }

  function prev() {
    if (currentStepIndex.value > 0) {
      moveTo(currentStepIndex.value - 1);
    }
  }

  function moveTo(index: number) {
    const step = activeSteps.value[index];
    const target = findTourTarget(step.target);
    if (navigationOpen.value && !target?.closest(".mobile-course-navigation")) navigationOpen.value = false;
    // Going back from the cards needs the reader to open the menu again.
    const menuIndex = activeSteps.value.findIndex(step => step.target === openMenuStep.target);
    if (menuIndex >= 0 && !target && findTourTarget(openMenuStep.target) && document.querySelector(`.shell-navigation ${step.target}`)) {
      index = menuIndex;
    }
    currentStepIndex.value = index;
  }

  function menuOpened() {
    if (!isOpen.value || !navigationOpen.value || activeSteps.value[currentStepIndex.value]?.target !== openMenuStep.target) return;
    // Now the real mobile controls exist, remove any unavailable steps before continuing.
    activeSteps.value = activeSteps.value.filter(step => findTourTarget(step.target));
    next();
  }

  function skip() {
    isOpen.value = false;
    currentStepIndex.value = 0;
    activeSteps.value = [];
    navigationOpen.value = navigationWasOpen;
  }

  function complete() {
    skip();
    if (browser) {
      localStorage.setItem(TOUR_COMPLETED_KEY, "true");
    }
  }

  return {
    isOpen,
    currentStepIndex,
    activeSteps,
    navigationOpen,

    get isMenuStep(): boolean {
      return activeSteps.value[currentStepIndex.value]?.target === openMenuStep.target;
    },

    get currentStep(): TourStep | null {
      return activeSteps.value[currentStepIndex.value] ?? null;
    },

    get totalSteps(): number {
      return activeSteps.value.length;
    },

    get isFirstStep(): boolean {
      return currentStepIndex.value === 0;
    },

    get isLastStep(): boolean {
      return currentStepIndex.value === activeSteps.value.length - 1;
    },

    get hasCompleted(): boolean {
      if (!browser) return false;
      return localStorage.getItem(TOUR_COMPLETED_KEY) === "true";
    },

    start,
    menuOpened,
    next,
    prev,
    skip,
    complete
  };
}

export const tourService = createTourService();
