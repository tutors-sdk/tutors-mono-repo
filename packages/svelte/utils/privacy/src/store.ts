import { writable, type Writable } from "svelte/store";

const CONSENT_STORE_KEY = "tutors_consent";

interface StoredConsent {
  granted: boolean;
  preferences: {
    analytics: boolean;
    presence: boolean;
  };
  timestamp: string;
  version: number;
}

function loadConsent(): StoredConsent | null {
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

function saveConsent(state: StoredConsent): void {
  try {
    localStorage.setItem(CONSENT_STORE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save consent:", error);
  }
}

const initialConsent: StoredConsent = loadConsent() ?? {
  granted: false,
  preferences: {
    analytics: false,
    presence: false
  },
  timestamp: new Date().toISOString(),
  version: 1
};

export const consentState: Writable<StoredConsent> = writable(initialConsent);

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
  consentState.update((state) => ({
    ...state,
    granted: enabled,
    preferences: {
      ...state.preferences,
      [category]: enabled
    },
    timestamp: new Date().toISOString()
  }));
}

export function getConsent(): boolean {
  let stored = loadConsent();
  if (!stored) {
    stored = {
      granted: false,
      preferences: { analytics: false, presence: false },
      timestamp: new Date().toISOString(),
      version: 1
    };
    saveConsent(stored);
  }
  return stored.granted;
}

export function getConsent_preferences(): { analytics: boolean; presence: boolean } {
  let stored = loadConsent();
  if (!stored) {
    return { analytics: false, presence: false };
  }
  return stored.preferences;
}

export function resetConsent(): void {
  localStorage.removeItem(CONSENT_STORE_KEY);
}
