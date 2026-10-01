import { rune, currentCourse } from "@tutors/runes";
import type { TourStep } from "./types";
import { cardStepForType, courseHeaderSteps, courseSidebarSteps, homeSteps } from "./steps";
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
  return [...courseHeaderSteps, ...courseSidebarSteps, ...cardSteps()];
}

function createTourService() {
  const isOpen = rune(false);
  const currentStepIndex = rune(0);
  const activeSteps = rune<TourStep[]>([]);

  function start(steps: TourStep[] = buildTourSteps()) {
    if (!browser) return;
    const visible = steps.filter(step => findTourTarget(step.target));
    if (visible.length === 0) return;
    activeSteps.value = visible;
    currentStepIndex.value = 0;
    isOpen.value = true;
  }

  function next() {
    if (currentStepIndex.value < activeSteps.value.length - 1) {
      currentStepIndex.value++;
    } else {
      complete();
    }
  }

  function prev() {
    if (currentStepIndex.value > 0) {
      currentStepIndex.value--;
    }
  }

  function skip() {
    isOpen.value = false;
    currentStepIndex.value = 0;
    activeSteps.value = [];
  }

  function complete() {
    isOpen.value = false;
    currentStepIndex.value = 0;
    activeSteps.value = [];
    if (browser) {
      localStorage.setItem(TOUR_COMPLETED_KEY, "true");
    }
  }

  return {
    isOpen,
    currentStepIndex,
    activeSteps,

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
    next,
    prev,
    skip,
    complete
  };
}

export const tourService = createTourService();
