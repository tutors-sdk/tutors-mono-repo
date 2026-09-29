import { rune, currentLo } from "@tutors/runes";
import type { TourPageKind, TourStep } from "./types";
import { stepsForPage } from "./steps";
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
 * The kind of page the reader is on, from the learning object it is showing. A course home, a topic
 * and a lab each have something of their own for the tour to point at; everything else gets the
 * shell steps under "other".
 */
export function currentTourPage(): TourPageKind {
  const type = currentLo.value?.type;
  return type === "course" || type === "topic" || type === "lab" ? type : "other";
}

function createTourService() {
  const isOpen = rune(false);
  const currentStepIndex = rune(0);
  const activeSteps = rune<TourStep[]>([]);

  /** Starts the tour. With no argument it takes the steps for the page the reader is on. */
  function start(steps: TourStep[] = stepsForPage(currentTourPage())) {
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
