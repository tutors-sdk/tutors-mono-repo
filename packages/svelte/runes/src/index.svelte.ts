import type { TutorsId } from "@tutors/tutors-model-lib";
import type { Course, Lo } from "@tutors/tutors-model-lib";

export const rune = <T>(initialValue: T) => {
  let _rune = $state(initialValue);
  return {
    get value() {
      return _rune;
    },
    set value(v: T) {
      _rune = v;
    }
  };
};

// Lazy initialization to avoid SSR issues
let _currentLabStepIndex: ReturnType<typeof rune<number>> | null = null;
let _currentNotebookCellIndex: ReturnType<typeof rune<number>> | null = null;
let _adobeLoaded: ReturnType<typeof rune<boolean>> | null = null;
let _animationDelay: ReturnType<typeof rune<number>> | null = null;
let _currentLo: ReturnType<typeof rune<Lo | null>> | null = null;
let _currentCourse: ReturnType<typeof rune<Course | null>> | null = null;
let _courseProtocol: ReturnType<typeof rune<string>> | null = null;
export const currentLabStepIndex = {
  get value() { return (_currentLabStepIndex ??= rune(0)).value; },
  set value(v) { (_currentLabStepIndex ??= rune(0)).value = v; }
};

// The cell of the notebook on screen. A lab's step comes from the route, but a notebook is one page, so
// the page publishes it here for the course navigation to mark. It is not a lab step: EditCoursButton
// builds a source path from currentLabStepIndex, and a notebook is a single file.
export const currentNotebookCellIndex = {
  get value() { return (_currentNotebookCellIndex ??= rune(0)).value; },
  set value(v) { (_currentNotebookCellIndex ??= rune(0)).value = v; }
};

export const adobeLoaded = {
  get value() { return (_adobeLoaded ??= rune(false)).value; },
  set value(v) { (_adobeLoaded ??= rune(false)).value = v; }
};

export const animationDelay = {
  get value() { return (_animationDelay ??= rune(200)).value; },
  set value(v) { (_animationDelay ??= rune(200)).value = v; }
};

export const currentLo = {
  get value() { return (_currentLo ??= rune<Lo | null>(null)).value; },
  set value(v) { (_currentLo ??= rune<Lo | null>(null)).value = v; }
};

export const currentCourse = {
  get value() { return (_currentCourse ??= rune<Course | null>(null)).value; },
  set value(v) { (_currentCourse ??= rune<Course | null>(null)).value = v; }
};

// Initialize before conditional rendering so the profile subscribes to sign-in changes.
export const tutorsId = rune<TutorsId | null>(null);

export const courseProtocol = {
  get value() { return (_courseProtocol ??= rune("https://")).value; },
  set value(v) { (_courseProtocol ??= rune("https://")).value = v; }
};

// Access checks may first read these inside a derived expression. Create their
// state here so that expression subscribes to subsequent permission updates.
export const isEducator = rune(false);
export const contentLocks = rune<Map<string, boolean>>(new Map());
export const locksLoaded = rune(false);
