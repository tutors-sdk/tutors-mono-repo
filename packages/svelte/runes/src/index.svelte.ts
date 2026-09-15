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
let _adobeLoaded: ReturnType<typeof rune<boolean>> | null = null;
let _animationDelay: ReturnType<typeof rune<number>> | null = null;
let _currentLo: ReturnType<typeof rune<Lo | null>> | null = null;
let _currentCourse: ReturnType<typeof rune<Course | null>> | null = null;
let _tutorsId: ReturnType<typeof rune<TutorsId | null>> | null = null;
let _courseProtocol: ReturnType<typeof rune<string>> | null = null;
export const currentLabStepIndex = {
  get value() { return (_currentLabStepIndex ??= rune(0)).value; },
  set value(v) { (_currentLabStepIndex ??= rune(0)).value = v; }
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

export const tutorsId = {
  get value() { return (_tutorsId ??= rune<TutorsId | null>(null)).value; },
  set value(v) { (_tutorsId ??= rune<TutorsId | null>(null)).value = v; }
};

export const courseProtocol = {
  get value() { return (_courseProtocol ??= rune("https://")).value; },
  set value(v) { (_courseProtocol ??= rune("https://")).value = v; }
};

let _isEducator: ReturnType<typeof rune<boolean>> | null = null;
let _contentLocks: ReturnType<typeof rune<Map<string, boolean>>> | null = null;
let _locksLoaded: ReturnType<typeof rune<boolean>> | null = null;

export const isEducator = {
  get value() { return (_isEducator ??= rune(false)).value; },
  set value(v) { (_isEducator ??= rune(false)).value = v; }
};

export const contentLocks = {
  get value() { return (_contentLocks ??= rune<Map<string, boolean>>(new Map())).value; },
  set value(v) { (_contentLocks ??= rune<Map<string, boolean>>(new Map())).value = v; }
};

export const locksLoaded = {
  get value() { return (_locksLoaded ??= rune(false)).value; },
  set value(v) { (_locksLoaded ??= rune(false)).value = v; }
};

