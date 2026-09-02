import { writable, type Writable } from "svelte/store";
import type { ConsentState } from "./types.ts";

const CONSENT_STORE_KEY = "tutors_consent";

function loadConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(CONSENT_STORE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveConsent(state: ConsentState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONSENT_STORE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save consent:", error);
  }
}

const initialConsent: ConsentState = loadConsent() ?? {
  granted: false,
  preferences: {
    analytics: false,
    presence: false
  },
  timestamp: new Date().toISOString(),
  version: 1
};

export const consentState: Writable<ConsentState> = writable(initialConsent);

consentState.subscribe((state) => {
  saveConsent(state);
});

export function grantConsent(): void {
  consentState.update((state) => ({
    ...state,
    granted: true,
    preferences: {
      analytics: true,
      presence: true
    },
    timestamp: new Date().toISOString()
  }));
}

export function revokeConsent(): void {
  consentState.update((state) => ({
    ...state,
    granted: false,
    preferences: {
      analytics: false,
      presence: false
    },
    timestamp: new Date().toISOString()
  }));
}

export function setConsentCategory(category: "analytics" | "presence", enabled: boolean): void {
  consentState.update((state) => {
    const preferences = { ...state.preferences, [category]: enabled };
    return {
      ...state,
      granted: preferences.analytics || preferences.presence,
      preferences,
      timestamp: new Date().toISOString()
    };
  });
}

export function getConsent(): boolean {
  const stored = loadConsent();
  if (!stored) return false;
  return stored.granted;
}

export function getConsent_preferences(): { analytics: boolean; presence: boolean } {
  const stored = loadConsent();
  if (!stored) {
    return { analytics: false, presence: false };
  }
  return stored.preferences;
}

export function resetConsent(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(CONSENT_STORE_KEY);
  }
  consentState.set({
    granted: false,
    preferences: { analytics: false, presence: false },
    timestamp: new Date().toISOString(),
    version: 1
  });
}
